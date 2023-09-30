mod db;

use bitcoin::{Transaction, Address, Network, secp256k1, hashes::sha256, Txid};
use secp256k1_zkp::{PublicKey, SecretKey, XOnlyPublicKey, Secp256k1, Message, musig::{MusigPubNonce, BlindingFactor}, schnorr::Signature, Scalar};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::Sqlite;

use crate::{error::CError, key_derivation};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct BackupTransaction {
    statechain_id: String,
    tx_n: u32,
    tx: Transaction,
    client_public_nonce: Vec<u8>,
    blinding_factor: Vec<u8>,
    recipient_address: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct SerializedBackupTransaction {
    tx_n: u32,
    tx: String,
    client_public_nonce: String,
    blinding_factor: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct TransferMsg {
    statechain_id: String,
    transfer_signature: String,
    backup_transactions: Vec<SerializedBackupTransaction>,
    t1: [u8; 32],
}

impl BackupTransaction {
    fn serialize(&self) -> SerializedBackupTransaction {
        SerializedBackupTransaction {
            tx_n: self.tx_n,
            tx: hex::encode(&bitcoin::consensus::encode::serialize(&self.tx)),
            client_public_nonce: hex::encode(&self.client_public_nonce),
            blinding_factor: hex::encode(&self.blinding_factor),
        }
    }
}

// Step 7. Owner 1 then concatinates the Tx0 outpoint with the Owner 2 public key (O2) and signs it with their key o1 to generate SC_sig_1.
fn get_transfer_signature(new_user_pubkey: PublicKey, input_txid: &Txid, input_vout: u32, client_seckey: &SecretKey) -> Signature {

    let secp = Secp256k1::new();
    let keypair = secp256k1::KeyPair::from_seckey_slice(&secp, client_seckey.as_ref()).unwrap();

    let mut data_to_sign = Vec::<u8>::new();
    data_to_sign.extend_from_slice(&input_txid[..]);
    data_to_sign.extend_from_slice(&input_vout.to_le_bytes());
    data_to_sign.extend_from_slice(&new_user_pubkey.serialize()[..]);

    let msg = Message::from_hashed_data::<sha256::Hash>(&data_to_sign);
    let signature = secp.sign_schnorr(&msg, &keypair);

    signature
}

fn verify_transfer_signature(new_user_pubkey: XOnlyPublicKey, input_txid: &Txid, input_vout: u32, signature: &Signature) -> bool {

    let secp = Secp256k1::new();

    let mut data_to_verify = Vec::<u8>::new();
    data_to_verify.extend_from_slice(&input_txid[..]);
    data_to_verify.extend_from_slice(&input_vout.to_le_bytes());
    data_to_verify.extend_from_slice(&new_user_pubkey.serialize()[..]);

    let msg = Message::from_hashed_data::<sha256::Hash>(&data_to_verify);

    secp.verify_schnorr(signature, &msg, &new_user_pubkey).is_ok()
}

/* async fn sign_statechain_id(pool: &sqlx::Pool<Sqlite>, statechain_id: &str) {
    let row = sqlx::query("SELECT auth_seckey FROM signer_data WHERE statechain_id = $1")
        .bind(statechain_id)
        .fetch_one(pool)
        .await
        .unwrap();

    let auth_secret_key_bytes = row.get::<Vec<u8>, _>("auth_seckey");
    let auth_secret_key = SecretKey::from_slice(&auth_secret_key_bytes).unwrap();


} */

async fn get_new_x1(statechain_id: &str, signed_statechain_id: &Signature, new_auth_pubkey: &PublicKey) -> Result<Vec<u8>, CError> {
    let endpoint = "http://127.0.0.1:8000";
    let path = "transfer/sender";

    let client = reqwest::Client::new();
    let request = client.post(&format!("{}/{}", endpoint, path));

    #[derive(Serialize, Deserialize)]
    struct TransferSenderRequestPayload {
        statechain_id: String,
        auth_sig: String, // signed_statechain_id
        new_user_auth_key: String,
        batch_id: Option<String>,
    }

    let transfer_sender_request_payload = TransferSenderRequestPayload {
        statechain_id: statechain_id.to_string(),
        auth_sig: signed_statechain_id.to_string(),
        new_user_auth_key: new_auth_pubkey.to_string(),
        batch_id: None,
    };

    let value = match request.json(&transfer_sender_request_payload).send().await {
        Ok(response) => {

            let status = response.status();
            let text = response.text().await.unwrap_or("Unexpected error".to_string());

            if status.is_success() {
                text
            } else {
                return Err(CError::Generic(format!("status: {}, error: {}", status, text)));
            }
        },
        Err(err) => {
            return Err(CError::Generic(format!("status: {}, error: {}", err.status().unwrap(),err.to_string())));
        },
    };

    #[derive(Serialize, Deserialize)]
    pub struct TransferSenderResponsePayload<'r> {
        x1: &'r str,
    }

    let response: TransferSenderResponsePayload = serde_json::from_str(value.as_str()).expect(&format!("failed to parse: {}", value.as_str()));

    let x1 = hex::decode(response.x1).unwrap();

    Ok(x1)
}

pub async fn init(pool: &sqlx::Pool<Sqlite>, recipient_address: &str, statechain_id: &str, network: Network) -> Result<(), CError>{

    let (_, new_user_pubkey, new_auth_pubkey) = key_derivation::decode_transfer_address(recipient_address).unwrap();
    println!("new_user_pubkey: {}", new_user_pubkey);
    println!("new_auth_pubkey: {}", new_auth_pubkey);

    let mut backup_transactions = db::get_backup_transactions(&pool, &statechain_id).await;

    if backup_transactions.len() == 0 {
        return Err(CError::Generic("No backup transactions found".to_string()));
    }   

    backup_transactions.sort_by(|a, b| b.tx_n.cmp(&a.tx_n));

    let tx1 = &backup_transactions[0];

    println!("tx1: {}", tx1.tx.txid());
    println!("tx1_n: {}", tx1.tx_n);
    println!("tx1_client_public_nonce: {}", hex::encode(&tx1.client_public_nonce));
    println!("tx1_blinding_factor: {}", hex::encode(&tx1.blinding_factor));

    let (client_seckey, 
        input_txid, 
        input_vout, 
        transaction, 
        client_pub_nonce, 
        blinding_factor, 
        signed_statechain_id) = 
    create_backup_tx_to_receiver(&pool, &tx1.tx, new_user_pubkey, &statechain_id, network).await;

    let x1 = get_new_x1(&statechain_id, &signed_statechain_id, &new_auth_pubkey).await;

    let new_tx_n = backup_transactions.last().unwrap().tx_n + 1;

    let new_bakup_tx = BackupTransaction {
        statechain_id: statechain_id.to_string(),
        tx_n: new_tx_n,
        tx: transaction,
        client_public_nonce: client_pub_nonce.serialize().to_vec(),
        blinding_factor: blinding_factor.as_bytes().to_vec(),
        recipient_address: recipient_address.to_string(),
    };

    backup_transactions.push(new_bakup_tx.clone());

    let mut serialized_backup_transactions = Vec::<SerializedBackupTransaction>::new();

    for backup_tx in backup_transactions {
        serialized_backup_transactions.push(backup_tx.serialize());
    }

    let transfer_signature = get_transfer_signature(new_user_pubkey, &input_txid, input_vout, &client_seckey);

    let x1: [u8; 32] = x1?.try_into().unwrap();
    let x1 = Scalar::from_be_bytes(x1).unwrap();

    let t1 = client_seckey.add_tweak(&x1).unwrap();

    let transfer_msg = TransferMsg {
        statechain_id: statechain_id.to_string(),
        transfer_signature: transfer_signature.to_string(),
        backup_transactions: serialized_backup_transactions,
        t1: t1.secret_bytes(),
    };

    let transfer_msg_json = json!(&transfer_msg);

    let transfer_msg_json_str = serde_json::to_string_pretty(&transfer_msg_json).unwrap();

    let msg = transfer_msg_json_str.as_bytes();

    let serialized_new_auth_pubkey = &new_auth_pubkey.serialize();
    let encrypted_msg = ecies::encrypt(serialized_new_auth_pubkey, msg).unwrap();

    let encrypted_msg_string = hex::encode(&encrypted_msg);

    #[derive(Serialize, Deserialize)]
    struct TransferUpdateMsgRequestPayload {
        statechain_id: String,
        auth_sig: String, // signed_statechain_id
        new_user_auth_key: String,
        enc_transfer_msg: String,
    }

    let transfer_update_msg_request_payload = TransferUpdateMsgRequestPayload {
        statechain_id: statechain_id.to_string(),
        auth_sig: signed_statechain_id.to_string(),
        new_user_auth_key: new_auth_pubkey.to_string(),
        enc_transfer_msg: encrypted_msg_string.clone(),
    };

    let endpoint = "http://127.0.0.1:8000";
    let path = "transfer/update_msg";

    let client = reqwest::Client::new();
    let request = client.post(&format!("{}/{}", endpoint, path));

    match request.json(&transfer_update_msg_request_payload).send().await {
        Ok(response) => {
            let status = response.status();
            if !status.is_success() {
                return Err(CError::Generic("Failed to update transfer message".to_string()));
            }
        },
        Err(err) => 
            return Err(CError::Generic(err.to_string()))
        ,
    };


/*     println!("{}", serde_json::to_string_pretty(&json!({
        "encrypted_msg": encrypted_msg_string,
        "auth_pubkey": new_auth_pubkey.to_string(),
    })).unwrap());
*/

    Ok(()) 
}

pub struct StatechainCoinDetails {
    pub client_seckey: SecretKey,
    pub client_pubkey: PublicKey,
    pub amount: u64,
    pub server_pubkey: PublicKey,
    pub aggregated_xonly_pubkey: XOnlyPublicKey,
    pub p2tr_agg_address: Address,
    pub auth_seckey: SecretKey,
}

pub async fn create_backup_tx_to_receiver(pool: &sqlx::Pool<Sqlite>, tx1: &Transaction, new_user_pubkey: PublicKey, statechain_id: &str, network: Network) 
    -> (SecretKey, Txid, u32, Transaction, MusigPubNonce, BlindingFactor, Signature) {

    let lock_time = tx1.lock_time;
    assert!(lock_time.is_block_height());
    let block_height = lock_time.to_consensus_u32();

    assert!(tx1.input.len() == 1);
    let input = &tx1.input[0];
    
    let statechain_coin_details = db::get_statechain_coin_details(&pool, &statechain_id, network).await;

    let auth_secret_key = statechain_coin_details.auth_seckey;

    let secp = Secp256k1::new();
    let keypair = secp256k1::KeyPair::from_seckey_slice(&secp, auth_secret_key.as_ref()).unwrap();
    let msg = Message::from_hashed_data::<sha256::Hash>(statechain_id.to_string().as_bytes());
    let signed_statechain_id = secp.sign_schnorr(&msg, &keypair);

    let client_seckey = statechain_coin_details.client_seckey;
    let client_pubkey = statechain_coin_details.client_pubkey;
    let server_pubkey = statechain_coin_details.server_pubkey;
    let input_txid = input.previous_output.txid;
    let input_vout = input.previous_output.vout;
    let input_pubkey =statechain_coin_details.aggregated_xonly_pubkey;
    let input_scriptpubkey = statechain_coin_details.p2tr_agg_address.script_pubkey();
    let input_amount = statechain_coin_details.amount;

    let to_address = Address::p2tr(&Secp256k1::new(), new_user_pubkey.x_only_public_key().0, None, network);

    let (new_tx, client_pub_nonce, blinding_factor) = crate::transaction::new_backup_transaction(
        pool, 
        block_height,
        statechain_id,
        &signed_statechain_id,
        &client_seckey,
        &client_pubkey,
        &server_pubkey,
        input_txid, 
        input_vout, 
        &input_pubkey, 
        &input_scriptpubkey, 
        input_amount, 
        &to_address).await.unwrap();

    // let tx_bytes = bitcoin::consensus::encode::serialize(&new_tx);

    // let client = electrum_client::Client::new("tcp://127.0.0.1:50001").unwrap();
    
    // let txid = electrum::transaction_broadcast_raw(&client, &tx_bytes);

    // println!("txid sent: {}", txid);

    (client_seckey, input_txid, input_vout, new_tx, client_pub_nonce, blinding_factor, signed_statechain_id)

}