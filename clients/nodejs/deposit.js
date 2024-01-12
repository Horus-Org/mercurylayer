const axios = require('axios').default;
const { SocksProxyAgent } = require('socks-proxy-agent');
const bitcoinjs = require("bitcoinjs-lib");
const ecc = require("tiny-secp256k1");
const utils = require('./utils');
const transaction = require('./transaction');
const config = require('config');

// used only for random token. Can be removed later
// const crypto = require('crypto');

const mercury_wasm = require('mercury-wasm');

const sqlite_manager = require('./sqlite_manager');

const { CoinStatus } = require('./coin_enum');

// Note: incomplete probably be removed later
/*
const execute = async (electrumClient, db, wallet_name, token_id, amount) => {

    let token = getRealToken();

    let deposit_options = (await axios.get("http://45.76.136.11:9000/token/token_init")).data;
    const { fee, btc_payment_address, lightning_invoice, processor_id, token_id } = deposit_options;

    console.log('Fee', fee);
    console.log('processor_id', processor_id);
    console.log('token_id', token_id);

    let swiss_pay_process = (await axios.get(`https://api.swiss-bitcoin-pay.ch/checkout/${processor_id}`)).data;
    console.log('swiss_pay_process', swiss_pay_process);

    let check_status = (await axios.get(`http://45.76.136.11:9000/token/token_verify/${token_id}`)).data;
    const { confirmed } = check_status;
    console.log('confirmed:', confirmed);
}*/

const getRealToken = async () => {

    const statechain_entity_url = config.get('tokenServer');
    const path = "token/token_init";
    const url = statechain_entity_url + '/' + path;
    const torProxy = config.get('torProxy');

    let socksAgent = undefined;

    if (torProxy) {
        socksAgent = { httpAgent: new SocksProxyAgent(torProxy) };
    }

    const response = await axios.get(url, socksAgent);

    if (response.status != 200) {
        throw new Error(`Token error: ${response.data}`);
    }

    let token = response.data;

    console.log('token', token);

    return token;
}

const getDepositBitcoinAddress = async (db, wallet_name, token_id, amount) => {

    let wallet = await sqlite_manager.getWallet(db, wallet_name);

    await init(db, wallet, token_id);

    let coin = wallet.coins[wallet.coins.length - 1];

    let aggregatedPublicKey = mercury_wasm.createAggregatedAddress(coin, wallet.network);

    coin.amount = parseInt(amount, 10);
    coin.aggregated_address = aggregatedPublicKey.aggregate_address;
    coin.aggregated_pubkey = aggregatedPublicKey.aggregate_pubkey;

    await sqlite_manager.updateWallet(db, wallet);

    return { "deposit_address": coin.aggregated_address, "statechain_id": coin.statechain_id };
}

const createTx1 = async (electrumClient, coin, wallet_network, tx0_hash, tx0_vout) => {

    if (coin.status !== CoinStatus.INITIALISED) {
        throw new Error(`The coin with the aggregated address ${aggregated_address} is not in the INITIALISED state`);
    }

    if ('utxo_txid' in coin && 'input_vout' in coin) {
        throw new Error(`The coin with the aggregated address ${aggregated_address} has already been deposited`);
    }

    coin.utxo_txid = tx0_hash;
    coin.utxo_vout = tx0_vout;
    coin.status = CoinStatus.IN_MEMPOOL;

    const toAddress = mercury_wasm.getUserBackupAddress(coin, wallet_network);
    const isWithdrawal = false;
    const qtBackupTx = 0;

    let signed_tx = await transaction.new_transaction(electrumClient, coin, toAddress, isWithdrawal, qtBackupTx, null, wallet_network);

    let backup_tx = {
        tx_n: 1,
        tx: signed_tx,
        client_public_nonce: coin.public_nonce,
        server_public_nonce: coin.server_public_nonce,
        client_public_key: coin.user_pubkey,
        server_public_key: coin.server_pubkey,
        blinding_factor: coin.blinding_factor
    };

    coin.locktime = mercury_wasm.getBlockheight(backup_tx);

    return backup_tx;
}

/*
const createStatecoin = async (electrumClient, db, wallet_name, aggregated_address, amount) => {

    let wallet = await sqlite_manager.getWallet(db, wallet_name);

    let coin = wallet.coins.filter(c => {
        return c.aggregated_address === aggregated_address
    });

    if (!coin) {
        throw new Error(`There is no coin with the aggregated address ${aggregated_address}`);
    }

    coin = coin[0];

    if (coin.status !== CoinStatus.INITIALISED) {
        throw new Error(`The coin with the aggregated address ${aggregated_address} is not in the INITIALISED state`);
    }

    if ('utxo_txid' in coin && 'input_vout' in coin) {
        throw new Error(`The coin with the aggregated address ${aggregated_address} has already been deposited`);
    }

    let deposited = await checkDeposit(electrumClient, coin, wallet.network);

    if (!deposited) {
        throw new Error(`The coin with the aggregated address ${aggregated_address} has not been deposited yet`);
    }

    coin.status = CoinStatus.IN_MEMPOOL;

    await sqlite_manager.updateWallet(db, wallet);

    const toAddress = mercury_wasm.getUserBackupAddress(coin, wallet.network);
    const isWithdrawal = false;
    const qtBackupTx = 0;

    let signed_tx = await transaction.new_transaction(electrumClient, coin, toAddress, isWithdrawal, qtBackupTx, null, wallet.network);

    let backup_tx = {
        tx_n: 1,
        tx: signed_tx,
        client_public_nonce: coin.public_nonce,
        server_public_nonce: coin.server_public_nonce,
        client_public_key: coin.user_pubkey,
        server_public_key: coin.server_pubkey,
        blinding_factor: coin.blinding_factor
    };

    coin.locktime = mercury_wasm.getBlockheight(backup_tx);

    await sqlite_manager.insertTransaction(db, coin.statechain_id, [backup_tx]);

    // let res = await electrumClient.request('blockchain.transaction.broadcast', [signed_tx]);

    let utxo = `${coin.utxo_txid}:${coin.input_vout}`;

    let activity = {
        utxo: utxo,
        amount: amount,
        action: "Deposit",
        date: new Date().toISOString()
    };

    wallet.activities.push(activity);

    await sqlite_manager.updateWallet(db, wallet);

    return coin;
}

const checkDeposit = async (electrumClient, coin, wallet_network) => {

    bitcoinjs.initEccLib(ecc);

    const network = utils.getNetwork(wallet_network);

    let script = bitcoinjs.address.toOutputScript(coin.aggregated_address, network);
    let hash = bitcoinjs.crypto.sha256(script);
    let reversedHash = Buffer.from(hash.reverse());
    reversedHash = reversedHash.toString('hex');

    try {
        let utxo_list = await electrumClient.request('blockchain.scripthash.listunspent', [reversedHash]);

        for (let utxo of utxo_list) {
            if (utxo.value === coin.amount) {
                coin.utxo_txid = utxo.tx_hash;
                coin.utxo_vout = utxo.tx_pos;
                return true;
            }
        }
    } catch (e) {
        console.log(e);
    }

    return false;
}
*/

const init = async (db, wallet, token_id) => {
    let coin = mercury_wasm.getNewCoin(wallet);

    wallet.coins.push(coin);

    await sqlite_manager.updateWallet(db, wallet);

    // token_id = crypto.randomUUID().replace('-','');

    let depositMsg1 = mercury_wasm.createDepositMsg1(coin, token_id);

    const statechain_entity_url = config.get('statechainEntity');
    const path = "deposit/init/pod";
    const url = statechain_entity_url + '/' + path;

    const torProxy = config.get('torProxy');

    let socksAgent = undefined;

    if (torProxy) {
        socksAgent = { httpAgent: new SocksProxyAgent(torProxy) };
    }

    const response = await axios.post(url, depositMsg1, socksAgent);

    if (response.status != 200) {
        throw new Error(`Deposit error: ${response.data}`);
    }

    let depositMsg1Response = response.data;

    let depositInitResult = mercury_wasm.handleDepositMsg1Response(coin, depositMsg1Response);
    // console.log("depositInitResult:", depositInitResult);

    coin.statechain_id = depositInitResult.statechain_id;
    coin.signed_statechain_id = depositInitResult.signed_statechain_id;
    coin.server_pubkey = depositInitResult.server_pubkey;

    await sqlite_manager.updateWallet(db, wallet);
}

// This gets a test token, not a real token
const getToken = async () => {

    const statechain_entity_url = config.get('statechainEntity');
    const path = "deposit/get_token";
    const url = statechain_entity_url + '/' + path;

    const torProxy = config.get('torProxy');

    let socksAgent = undefined;

    if (torProxy) {
        socksAgent = { httpAgent: new SocksProxyAgent(torProxy) };
    }

    const response = await axios.get(url, socksAgent);

    if (response.status != 200) {
        throw new Error(`Token error: ${response.data}`);
    }

    let token = response.data;

    return token.token_id;
}

module.exports = { /*execute, createStatecoin,*/ getDepositBitcoinAddress, createTx1, getToken, getRealToken };