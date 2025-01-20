import { describe, test, expect } from "vitest";

import axios from 'axios';
import CoinStatus from 'mercuryweblib/coin_enum.js';
import clientConfig from '../ClientConfig.js';
import mercuryweblib from 'mercuryweblib';
import { generateBlocks, depositCoin, checkDepositsConfirmation, handleTokenResponse } from '../test-utils.js';

async function validateBackupTransactions(backupTransactions, interval) {
    let currentTxid = null;
    let currentVout = null;
    let currentTxN = 0;
    let previousLockTime = 0;

    try {
        for (const backupTx of backupTransactions) {
            // Assuming these are async functions that return promises
            const outpoint = await mercuryweblib.getPreviousOutpoint(backupTx);
            const currentLockTime = await mercuryweblib.getBlockheight(backupTx);

            if (currentTxid !== null && currentVout !== null) {
                // Validate transaction chain
                expect(currentTxid).to.equal(outpoint.txid);
                expect(currentVout).to.equal(outpoint.vout);
                expect(currentLockTime).to.equal(previousLockTime - interval);
                expect(backupTx.tx_n).to.be.greaterThan(currentTxN);
            }

            // Update current values
            currentTxid = outpoint.txid;
            currentVout = outpoint.vout;
            currentTxN = backupTx.tx_n;
            previousLockTime = currentLockTime;
        }

        return true; // Success case

    } catch (error) {
        throw error; // Re-throw the error for handling by the caller
    }
}

describe('TA03 - Multiple Deposits', () => {
    test("basic workflow", async () => {

        localStorage.removeItem("mercury-layer:wallet1_tb03_1");
        localStorage.removeItem("mercury-layer:wallet2_tb03_1");

        let wallet1 = await mercuryweblib.createWallet(clientConfig, "wallet1_tb03_1");
        let wallet2 = await mercuryweblib.createWallet(clientConfig, "wallet2_tb03_1");

        let tokenResponse = await mercuryweblib.newToken(clientConfig, wallet1.name);

        let token_id = await handleTokenResponse(tokenResponse);

        let amount = 1000;
        
        let result = await mercuryweblib.getDepositBitcoinAddress(clientConfig, wallet1.name, token_id, amount);

        const statechainId = result.statechain_id;
    
        let isDepositInMempool = false;
        let isDepositConfirmed = false;
        let areBlocksGenerated = false;

        await depositCoin(result.deposit_address, amount);

        while (!isDepositConfirmed) {

            const coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
    
            for (let coin of coins) {
                if (coin.statechain_id === statechainId && coin.status === CoinStatus.IN_MEMPOOL && !isDepositInMempool) {
                    isDepositInMempool = true;
                } else if (coin.statechain_id === statechainId && coin.status === CoinStatus.CONFIRMED) {
                    isDepositConfirmed = true;
                    break;
                }
            }

            if (isDepositInMempool && !areBlocksGenerated) {
                areBlocksGenerated = true;
                await generateBlocks(clientConfig.confirmationTarget);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 2000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 1);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 2);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 3);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        const newCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        const duplicatedCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        const duplicatedCoin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        const duplicatedCoin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 3
        );

        expect(newCoin).to.not.be.undefined;
        expect(duplicatedCoin1).to.not.be.undefined;
        expect(duplicatedCoin2).to.not.be.undefined;
        expect(duplicatedCoin3).to.not.be.undefined;

        await generateBlocks(clientConfig.confirmationTarget);

        const allDepositsConfirmed = await checkDepositsConfirmation(newCoin.aggregated_address);

        expect(allDepositsConfirmed).to.be.true;

        let transferAddress = await mercuryweblib.newTransferAddress(wallet2.name);

        let duplicatedIndexes = [1, 3];

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet1.name,
            statechainId,
            transferAddress.transfer_receive,
            true, 
            null,            
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');

        const jsonData = localStorage.getItem(`mercury-layer:${wallet1.name}-${statechainId}`);
        let backupTxs = JSON.parse(jsonData);

        expect(backupTxs.length).to.equal(6);

        const split_backup_transactions = mercuryweblib.splitBackupTransactions(backupTxs);

        const infoConfig = await mercuryweblib.infoConfig(clientConfig);

        for (const [index, bkTxs] of split_backup_transactions.entries()) {
            if (index === 0) {
                const firstBkpTx = bkTxs[0];
                expect(firstBkpTx).to.not.be.undefined;

                const firstBackupOutpoint = await mercuryweblib.getPreviousOutpoint(firstBkpTx);
                expect(firstBackupOutpoint).to.not.be.undefined;
                expect(newCoin.utxo_txid).to.be.equals(firstBackupOutpoint.txid);
                expect(newCoin.utxo_vout).to.be.equals(firstBackupOutpoint.vout);
            }

            await validateBackupTransactions(bkTxs, infoConfig.interval);
        }

        let transferReceiveResult = await mercuryweblib.transferReceive(clientConfig, wallet2.name);
        expect(transferReceiveResult.receivedStatechainIds).contains(newCoin.statechain_id);
        expect(transferReceiveResult.receivedStatechainIds.length).to.equal(1);

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        const transferredCoin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 0
        );
        
        const transferredCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 1
        );

        const invalidatedCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.INVALIDATED && 
            coin.duplicate_index == 2
        );

        const transferredCoin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 3
        );

        expect(transferredCoin0).to.not.be.undefined;
        expect(transferredCoin1).to.not.be.undefined;
        expect(invalidatedCoin).to.not.be.undefined;
        expect(transferredCoin3).to.not.be.undefined;

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet2.name);

        const confirmedCoinWallet2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        const duplicatedCoin1Wallet2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        const duplicatedCoin2Wallet2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        expect(confirmedCoinWallet2).to.not.be.undefined;
        expect(duplicatedCoin1Wallet2).to.not.be.undefined;
        expect(duplicatedCoin2Wallet2).to.not.be.undefined;

        const toAddress = "bcrt1qn5948np2j8t68xgpceneg3ua4wcwhwrsqj8scv";

        let txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, 1);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, 2);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, null);
        expect(txid).to.be.string;
    });
}, 5000000000);

describe('TA03 - Multiple Deposits', () => {
    test("resend workflow", async () => {

        localStorage.removeItem("mercury-layer:wallet1_tb03_2");
        localStorage.removeItem("mercury-layer:wallet2_tb03_2");

        let wallet1 = await mercuryweblib.createWallet(clientConfig, "wallet1_tb03_2");
        let wallet2 = await mercuryweblib.createWallet(clientConfig, "wallet2_tb03_2");

        let tokenResponse = await mercuryweblib.newToken(clientConfig, wallet1.name);

        let token_id = await handleTokenResponse(tokenResponse);
        
        let amount = 1000;
        
        let result = await mercuryweblib.getDepositBitcoinAddress(clientConfig, wallet1.name, token_id, amount);

        const statechainId = result.statechain_id;

        let isDepositInMempool = false;
        let isDepositConfirmed = false;
        let areBlocksGenerated = false;

        await depositCoin(result.deposit_address, amount);

        while (!isDepositConfirmed) {

            const coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

            for (let coin of coins) {
                if (coin.statechain_id === statechainId && coin.status === CoinStatus.IN_MEMPOOL && !isDepositInMempool) {
                    isDepositInMempool = true;
                } else if (coin.statechain_id === statechainId && coin.status === CoinStatus.CONFIRMED) {
                    isDepositConfirmed = true;
                    break;
                }
            }

            if (isDepositInMempool && !areBlocksGenerated) {
                areBlocksGenerated = true;
                await generateBlocks(clientConfig.confirmationTarget);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 2000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 1);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 2);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 3);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        const newCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        const duplicatedCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        const duplicatedCoin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        const duplicatedCoin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 3
        );

        expect(newCoin).to.not.be.undefined;
        expect(duplicatedCoin1).to.not.be.undefined;
        expect(duplicatedCoin2).to.not.be.undefined;
        expect(duplicatedCoin3).to.not.be.undefined;

        await generateBlocks(clientConfig.confirmationTarget);

        const allDepositsConfirmed = await checkDepositsConfirmation(newCoin.aggregated_address);

        expect(allDepositsConfirmed).to.be.true;

        let transferAddress = await mercuryweblib.newTransferAddress(wallet2.name);

        let duplicatedIndexes = [1, 3];

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet1.name,
            statechainId,
            transferAddress.transfer_receive,
            true, 
            null,            
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        let coin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.IN_TRANSFER && 
            coin.duplicate_index == 0
        );
        
        let coin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.IN_TRANSFER && 
            coin.duplicate_index == 1
        );

        let coin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        let coin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.IN_TRANSFER && 
            coin.duplicate_index == 3
        );

        expect(coin0).to.not.be.undefined;
        expect(coin1).to.not.be.undefined;
        expect(coin2).to.not.be.undefined;
        expect(coin3).to.not.be.undefined;

        duplicatedIndexes = [2];

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet1.name,
            statechainId,
            transferAddress.transfer_receive,
            true, 
            null,            
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        coin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.IN_TRANSFER && 
            coin.duplicate_index == 0
        );
        
        coin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.IN_TRANSFER && 
            coin.duplicate_index == 1
        );

        coin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.IN_TRANSFER && 
            coin.duplicate_index == 2
        );

        coin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.IN_TRANSFER && 
            coin.duplicate_index == 3
        );

        expect(coin0).to.not.be.undefined;
        expect(coin1).to.not.be.undefined;
        expect(coin2).to.not.be.undefined;
        expect(coin3).to.not.be.undefined;

        let transferReceiveResult = await mercuryweblib.transferReceive(clientConfig, wallet2.name);
        expect(transferReceiveResult.receivedStatechainIds).contains(newCoin.statechain_id);
        expect(transferReceiveResult.receivedStatechainIds.length).to.equal(1);

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet2.name);

        coin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        coin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        coin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        coin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 3
        );

        expect(coin0).to.not.be.undefined;
        expect(coin1).to.not.be.undefined;
        expect(coin2).to.not.be.undefined;
        expect(coin3).to.not.be.undefined;

        expect(newCoin.utxo_txid).to.be.equals(coin0.utxo_txid);
        expect(newCoin.utxo_vout).to.be.equals(coin0.utxo_vout);

        const toAddress = "bcrt1qn5948np2j8t68xgpceneg3ua4wcwhwrsqj8scv";

        let txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, 1);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, 2);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, 3);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, null);
        expect(txid).to.be.string;

    });
}, 5000000000);

describe('TA03 - Multiple Deposits', () => {
    test("resend workflow", async () => {

        localStorage.removeItem("mercury-layer:wallet1_tb03_3");
        localStorage.removeItem("mercury-layer:wallet2_tb03_3");
        localStorage.removeItem("mercury-layer:wallet3_tb03_3");

        let wallet1 = await mercuryweblib.createWallet(clientConfig, "wallet1_tb03_3");
        let wallet2 = await mercuryweblib.createWallet(clientConfig, "wallet2_tb03_3");
        let wallet3 = await mercuryweblib.createWallet(clientConfig, "wallet3_tb03_3");

        let tokenResponse = await mercuryweblib.newToken(clientConfig, wallet1.name);

        let token_id = await handleTokenResponse(tokenResponse);

        let amount = 1000;
        
        let result = await mercuryweblib.getDepositBitcoinAddress(clientConfig, wallet1.name, token_id, amount);

        const statechainId = result.statechain_id;

        let isDepositInMempool = false;
        let isDepositConfirmed = false;
        let areBlocksGenerated = false;

        await depositCoin(result.deposit_address, amount);

        while (!isDepositConfirmed) {

            const coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

            for (let coin of coins) {
                if (coin.statechain_id === statechainId && coin.status === CoinStatus.IN_MEMPOOL && !isDepositInMempool) {
                    isDepositInMempool = true;
                } else if (coin.statechain_id === statechainId && coin.status === CoinStatus.CONFIRMED) {
                    isDepositConfirmed = true;
                    break;
                }
            }

            if (isDepositInMempool && !areBlocksGenerated) {
                areBlocksGenerated = true;
                await generateBlocks(clientConfig.confirmationTarget);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 2000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 1);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 2);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 3);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        const newCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        const duplicatedCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        const duplicatedCoin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        const duplicatedCoin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 3
        );

        expect(newCoin).to.not.be.undefined;
        expect(duplicatedCoin1).to.not.be.undefined;
        expect(duplicatedCoin2).to.not.be.undefined;
        expect(duplicatedCoin3).to.not.be.undefined;

        await generateBlocks(clientConfig.confirmationTarget);

        const allDepositsConfirmed = await checkDepositsConfirmation(newCoin.aggregated_address);

        expect(allDepositsConfirmed).to.be.true;

        let transferAddress = await mercuryweblib.newTransferAddress(wallet2.name);

        let duplicatedIndexes = [1, 2, 3];

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet1.name,
            statechainId,
            transferAddress.transfer_receive,
            true, 
            null,            
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');

        let transferReceiveResult = await mercuryweblib.transferReceive(clientConfig, wallet2.name);
        expect(transferReceiveResult.receivedStatechainIds).contains(newCoin.statechain_id);
        expect(transferReceiveResult.receivedStatechainIds.length).to.equal(1);

        transferAddress = await mercuryweblib.newTransferAddress(wallet3.name);

        duplicatedIndexes = [1, 2, 3];

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet2.name,
            statechainId,
            transferAddress.transfer_receive,
            true, 
            null,            
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');

        transferReceiveResult = await mercuryweblib.transferReceive(clientConfig, wallet3.name);
        expect(transferReceiveResult.receivedStatechainIds).contains(newCoin.statechain_id);
        expect(transferReceiveResult.receivedStatechainIds.length).to.equal(1);

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet3.name);

        let coin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        let coin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        let coin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        let coin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 3
        );

        expect(coin0).to.not.be.undefined;
        expect(coin1).to.not.be.undefined;
        expect(coin2).to.not.be.undefined;
        expect(coin3).to.not.be.undefined;

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet2.name);

        coin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 0
        );
        
        coin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 1
        );

        coin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 2
        );

        coin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 3
        );

        expect(coin0).to.not.be.undefined;
        expect(coin1).to.not.be.undefined;
        expect(coin2).to.not.be.undefined;
        expect(coin3).to.not.be.undefined;

        const toAddress = "bcrt1qn5948np2j8t68xgpceneg3ua4wcwhwrsqj8scv";

        let txid = await mercuryweblib.withdrawCoin(clientConfig, wallet3.name, statechainId, toAddress, null, 1);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet3.name, statechainId, toAddress, null, 2);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet3.name, statechainId, toAddress, null, 3);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet3.name, statechainId, toAddress, null, null);
        expect(txid).to.be.string;

    });
}, 5000000000);

describe('TA03 - Multiple Deposits', () => {
    test("send to itself workflow", async () => {

        localStorage.removeItem("mercury-layer:wallet1_tb03_4");
        localStorage.removeItem("mercury-layer:wallet2_tb03_4");

        let wallet1 = await mercuryweblib.createWallet(clientConfig, "wallet1_tb03_4");
        let wallet2 = await mercuryweblib.createWallet(clientConfig, "wallet2_tb03_4");

        let tokenResponse = await mercuryweblib.newToken(clientConfig, wallet1.name);

        let token_id = await handleTokenResponse(tokenResponse);
        
        let amount = 1000;
        
        let result = await mercuryweblib.getDepositBitcoinAddress(clientConfig, wallet1.name, token_id, amount);

        const statechainId = result.statechain_id;

        let isDepositInMempool = false;
        let isDepositConfirmed = false;
        let areBlocksGenerated = false;

        await depositCoin(result.deposit_address, amount);

        while (!isDepositConfirmed) {

            const coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

            for (let coin of coins) {
                if (coin.statechain_id === statechainId && coin.status === CoinStatus.IN_MEMPOOL && !isDepositInMempool) {
                    isDepositInMempool = true;
                } else if (coin.statechain_id === statechainId && coin.status === CoinStatus.CONFIRMED) {
                    isDepositConfirmed = true;
                    break;
                }
            }

            if (isDepositInMempool && !areBlocksGenerated) {
                areBlocksGenerated = true;
                await generateBlocks(clientConfig.confirmationTarget);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 2000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 1);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 2);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 3000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 3);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        const newCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        let duplicatedCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        let duplicatedCoin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        const duplicatedCoin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 3
        );

        expect(newCoin).to.not.be.undefined;
        expect(duplicatedCoin1).to.not.be.undefined;
        expect(duplicatedCoin2).to.not.be.undefined;
        expect(duplicatedCoin3).to.not.be.undefined;

        await generateBlocks(clientConfig.confirmationTarget);

        const allDepositsConfirmed = await checkDepositsConfirmation(newCoin.aggregated_address);

        expect(allDepositsConfirmed).to.be.true;

        let transferAddress = await mercuryweblib.newTransferAddress(wallet1.name);

        let duplicatedIndexes = [1, 3];

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet1.name,
            statechainId,
            transferAddress.transfer_receive,
            true,
            null,
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');

        let transferReceiveResult = await mercuryweblib.transferReceive(clientConfig, wallet1.name);
        expect(transferReceiveResult.receivedStatechainIds).contains(newCoin.statechain_id);
        expect(transferReceiveResult.receivedStatechainIds.length).to.equal(1);

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        let transferredCoin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 0
        );
        
        let transferredCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 1
        );

        let invalidatedCoin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.INVALIDATED && 
            coin.duplicate_index == 2
        );

        let transferredCoin3 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.TRANSFERRED && 
            coin.duplicate_index == 3
        );

        expect(transferredCoin0).to.not.be.undefined;
        expect(transferredCoin1).to.not.be.undefined;
        expect(invalidatedCoin2).to.not.be.undefined;
        expect(transferredCoin3).to.not.be.undefined;

        let confirmedCoin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        duplicatedCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        duplicatedCoin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        expect(confirmedCoin0).to.not.be.undefined;
        expect(duplicatedCoin1).to.not.be.undefined;
        expect(duplicatedCoin2).to.not.be.undefined;

        transferAddress = await mercuryweblib.newTransferAddress(wallet2.name);

        duplicatedIndexes = [1, 2];

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet1.name,
            statechainId,
            transferAddress.transfer_receive,
            true, 
            null,            
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');

        transferReceiveResult = await mercuryweblib.transferReceive(clientConfig, wallet2.name);
        expect(transferReceiveResult.receivedStatechainIds).contains(newCoin.statechain_id);
        expect(transferReceiveResult.receivedStatechainIds.length).to.equal(1);

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet2.name);

        confirmedCoin0 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        duplicatedCoin1 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 1
        );

        duplicatedCoin2 = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.duplicate_index == 2
        );

        expect(confirmedCoin0).to.not.be.undefined;
        expect(duplicatedCoin1).to.not.be.undefined;
        expect(duplicatedCoin2).to.not.be.undefined;

        const toAddress = "bcrt1qn5948np2j8t68xgpceneg3ua4wcwhwrsqj8scv";

        let txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, null);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, 1);
        expect(txid).to.be.string;

        txid = await mercuryweblib.withdrawCoin(clientConfig, wallet2.name, statechainId, toAddress, null, 2);
        expect(txid).to.be.string;
    });
}, 5000000000);

describe('TA03 - Multiple Deposits', () => {
    test("bsend unconfirmed duplicated workflow", async () => {

        localStorage.removeItem("mercury-layer:wallet1_tb03_5");
        localStorage.removeItem("mercury-layer:wallet2_tb03_5");

        let wallet1 = await mercuryweblib.createWallet(clientConfig, "wallet1_tb03_5");
        let wallet2 = await mercuryweblib.createWallet(clientConfig, "wallet2_tb03_5");

        let tokenResponse = await mercuryweblib.newToken(clientConfig, wallet1.name);

        let token_id = await handleTokenResponse(tokenResponse);

        let amount = 1000;
        
        let result = await mercuryweblib.getDepositBitcoinAddress(clientConfig, wallet1.name, token_id, amount);

        const statechainId = result.statechain_id;
    
        let isDepositInMempool = false;
        let isDepositConfirmed = false;
        let areBlocksGenerated = false;

        await depositCoin(result.deposit_address, amount);

        while (!isDepositConfirmed) {

            const coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
    
            for (let coin of coins) {
                if (coin.statechain_id === statechainId && coin.status === CoinStatus.IN_MEMPOOL && !isDepositInMempool) {
                    isDepositInMempool = true;
                } else if (coin.statechain_id === statechainId && coin.status === CoinStatus.CONFIRMED) {
                    isDepositConfirmed = true;
                    break;
                }
            }

            if (isDepositInMempool && !areBlocksGenerated) {
                areBlocksGenerated = true;
                await generateBlocks(clientConfig.confirmationTarget);
            }
            
            await new Promise(r => setTimeout(r, 1000));
        }

        amount = 1000;

        await depositCoin(result.deposit_address, amount);

        await generateBlocks(clientConfig.confirmationTarget);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 1);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);

        const newCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.CONFIRMED && 
            coin.duplicate_index == 0
        );
        
        const confirmedDuplicatedCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.amount == 1000
        );

        let allDepositsConfirmed = await checkDepositsConfirmation(newCoin.aggregated_address);

        expect(allDepositsConfirmed).to.be.true;

        amount = 2000;

        await depositCoin(result.deposit_address, amount);

        while (true) {
            let coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
            let duplicatedCoin = coins.find(coin => coin.statechain_id === statechainId && coin.status === CoinStatus.DUPLICATED && coin.duplicate_index == 2);
            if (duplicatedCoin) {
                break;
            }
            await new Promise(r => setTimeout(r, 1000));
        }

        coins = await mercuryweblib.listStatecoins(clientConfig, wallet1.name);
        
        const unconfirmedDuplicatedCoin = coins.find(coin => 
            coin.statechain_id === statechainId && 
            coin.status == CoinStatus.DUPLICATED && 
            coin.amount == 2000
        );

        expect(newCoin).to.not.be.undefined;
        expect(confirmedDuplicatedCoin).to.not.be.undefined;
        expect(unconfirmedDuplicatedCoin).to.not.be.undefined;

        let transferAddress = await mercuryweblib.newTransferAddress(wallet2.name);

        let duplicatedIndexes = [1, 2];

        try {
            result = await mercuryweblib.transferSend(
                clientConfig,
                wallet1.name,
                statechainId,
                transferAddress.transfer_receive,
                true, 
                null,            
                duplicatedIndexes
            );
        } catch (error) {
            expect(error.message).to.equal(`The coin with duplicated index ${unconfirmedDuplicatedCoin.duplicate_index} has not yet been confirmed. This transfer cannot be performed.`);
        }

        await generateBlocks(clientConfig.confirmationTarget);

        allDepositsConfirmed = await checkDepositsConfirmation(newCoin.aggregated_address);

        expect(allDepositsConfirmed).to.be.true;

        result = await mercuryweblib.transferSend(
            clientConfig,
            wallet1.name,
            statechainId,
            transferAddress.transfer_receive,
            true, 
            null,            
            duplicatedIndexes
        );
        expect(result).to.have.property('statechain_id');
        
    });
}, 5000000000);