import { expect } from 'chai'; 
import client_config from '../client_config.js';
import mercurynodejslib from 'mercurynodejslib';
import { CoinStatus } from 'mercurynodejslib/coin_enum.js';
import crypto from 'crypto';
import { sleep, createWallet, depositCoin, generateInvoice, payHoldInvoice, payInvoice, settleInvoice } from '../test_utils.js';

describe('TB04 - Lightning Latch', function() {
  this.timeout(30000);

  context('Simple Transfer', () => {
    it('should complete successfully', async () => {

      // await removeDatabase();
      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_1";
      let wallet_2_name = "w_ln_2";
      await createWallet(clientConfig, wallet_1_name);
      await createWallet(clientConfig, wallet_2_name);

      const token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      const tokenId = token.token_id;

      const amount = 10000;
      const depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      const tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      const usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      const listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin = listCoins[0];

      expect(coin.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin.statechain_id);

      const transferAddress = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin.statechain_id, transferAddress.transfer_receive, false, paymentHash.batchId);

      let transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.true;
      expect(transferReceiveResult.receivedStatechainIds).empty;

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin.statechain_id);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).not.empty;

      const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin.statechain_id, paymentHash.batchId);

      const hash = crypto.createHash('sha256')
          .update(Buffer.from(preimage, 'hex'))
          .digest('hex')

      expect(hash).to.equal(paymentHash.hash);
    })
  })

  context('The sender tries to get the pre-image before the batch is unlocked should fail', () => {
    it('should complete successfully', async () => {

      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_3";
      let wallet_2_name = "w_ln_4";
      await createWallet(clientConfig, wallet_1_name);
      await createWallet(clientConfig, wallet_2_name);

      const amount = 10000;
      let token = undefined;
      let tokenId = undefined;
      let depositInfo = undefined;
      let tokenList = undefined;
      let usedToken = undefined;
      let listCoins = undefined;

      token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      tokenId = token.token_id;

      depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin1 = listCoins[0];

      expect(coin1.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash1 = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin1.statechain_id);

      token = await mercurynodejslib.newToken(clientConfig, wallet_2_name);
      tokenId = token.token_id;

      depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_2_name, amount);

      tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_2_name);
      usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_2_name, amount, depositInfo);

      listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_2_name);

      expect(listCoins.length).to.equal(1);

      const coin2 = listCoins[0];

      expect(coin2.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash2 = await mercurynodejslib.paymentHash(clientConfig, wallet_2_name, coin2.statechain_id);

      const transferAddress1 = await mercurynodejslib.newTransferAddress(clientConfig, wallet_1_name, null);
      const transferAddress2 = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin1.statechain_id, transferAddress1.transfer_receive, false, paymentHash1.batchId);
      await mercurynodejslib.transferSend(clientConfig, wallet_2_name, coin2.statechain_id, transferAddress2.transfer_receive, false, paymentHash2.batchId);

      let transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_1_name);

      expect(transferReceiveResult.isThereBatchLocked).is.true;
      expect(transferReceiveResult.receivedStatechainIds).empty;

      try {
        const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin1.statechain_id, paymentHash1.batchId);
      } catch (error) {
          // Assert the captured error message
          const expectedMessage = 'Request failed with status code 404';
          expect(error.message).to.equal(expectedMessage);
      }

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin1.statechain_id);
      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_2_name, coin2.statechain_id);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).not.empty;

      const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin1.statechain_id, paymentHash1.batchId);

      const hash = crypto.createHash('sha256')
          .update(Buffer.from(preimage, 'hex'))
          .digest('hex')

      expect(hash).to.equal(paymentHash1.hash);
    })
  })

  context('Statecoin sender can recover (resend their coin) after batch timeout without completion', () => {
    it('should complete successfully', async () => {

      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_5";
      let wallet_2_name = "w_ln_6";
      await createWallet(clientConfig, wallet_1_name);
      await createWallet(clientConfig, wallet_2_name);

      const amount = 10000;
      let token = undefined;
      let tokenId = undefined;
      let depositInfo = undefined;
      let tokenList = undefined;
      let usedToken = undefined;
      let listCoins = undefined;

      token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      tokenId = token.token_id;

      depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin1 = listCoins[0];

      expect(coin1.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash1 = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin1.statechain_id);

      token = await mercurynodejslib.newToken(clientConfig, wallet_2_name);
      tokenId = token.token_id;

      depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_2_name, amount);

      tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_2_name);
      usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_2_name, amount, depositInfo);

      listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_2_name);

      expect(listCoins.length).to.equal(1);

      const coin2 = listCoins[0];

      expect(coin2.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash2 = await mercurynodejslib.paymentHash(clientConfig, wallet_2_name, coin2.statechain_id);

      const transferAddress1 = await mercurynodejslib.newTransferAddress(clientConfig, wallet_1_name, null);
      const transferAddress2 = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin1.statechain_id, transferAddress1.transfer_receive, false, paymentHash1.batchId);
      await mercurynodejslib.transferSend(clientConfig, wallet_2_name, coin2.statechain_id, transferAddress2.transfer_receive, false, paymentHash1.batchId);

      let transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_1_name);

      expect(transferReceiveResult.isThereBatchLocked).is.true;
      expect(transferReceiveResult.receivedStatechainIds).empty;

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin1.statechain_id);
      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_2_name, coin2.statechain_id);

      await sleep(20000);

      let errorMessage;
      console.error = (msg) => {
          errorMessage = msg;
      };

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      // Assert the captured error message
      const expectedMessage = 'Failed to update transfer message';
      expect(errorMessage).contains(expectedMessage);

      const transferAddress3 = await mercurynodejslib.newTransferAddress(clientConfig, wallet_1_name, null);
      const transferAddress4 = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin1.statechain_id, transferAddress3.transfer_receive, false, paymentHash2.batchId);
      await mercurynodejslib.transferSend(clientConfig, wallet_2_name, coin2.statechain_id, transferAddress4.transfer_receive, false, paymentHash2.batchId);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_1_name);

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin1.statechain_id);
      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_2_name, coin2.statechain_id);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).not.empty;

      const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin1.statechain_id, paymentHash1.batchId);

      const hash = crypto.createHash('sha256')
          .update(Buffer.from(preimage, 'hex'))
          .digest('hex')

      expect(hash).to.equal(paymentHash1.hash);
    })
  })

  context('Statecoin trade with invoice creation, payment and settlement', () => {
    it('should complete successfully', async () => {

      // await removeDatabase();
      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_7";
      let wallet_2_name = "w_ln_8";
      await createWallet(clientConfig, wallet_1_name);
      await createWallet(clientConfig, wallet_2_name);

      const token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      const tokenId = token.token_id;

      const amount = 10000;
      const depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      const tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      const usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      const listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin = listCoins[0];

      expect(coin.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin.statechain_id);

      const invoice = await generateInvoice(paymentHash.hash, amount);

      payInvoice(invoice.payment_request);

      const transferAddress = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin.statechain_id, transferAddress.transfer_receive, false, paymentHash.batchId);

      let transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.true;
      expect(transferReceiveResult.receivedStatechainIds).empty;

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin.statechain_id);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).not.empty;

      const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin.statechain_id, paymentHash.batchId);

      const hash = crypto.createHash('sha256')
          .update(Buffer.from(preimage, 'hex'))
          .digest('hex')

      expect(hash).to.equal(paymentHash.hash);

      await settleInvoice(preimage);
    })
  })

  context('Receiver tries to transfer invoice amount to another invoice before preimage retrieval should fail', () => {
    it('should complete successfully', async () => {

      // await removeDatabase();
      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_9";
      let wallet_2_name = "w_ln_10";
      await createWallet(clientConfig, wallet_1_name);
      await createWallet(clientConfig, wallet_2_name);

      const token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      const tokenId = token.token_id;

      const amount = 60000;
      const depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      const tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      const usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      const listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin = listCoins[0];

      expect(coin.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin.statechain_id);

      const invoice = await generateInvoice(paymentHash.hash, amount);

      payHoldInvoice(invoice.payment_request);

      const transferAddress = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin.statechain_id, transferAddress.transfer_receive, false, paymentHash.batchId);

      const hashFromServer = await mercurynodejslib.getPaymentHash(clientConfig, paymentHash.batchId);

      expect(hashFromServer).to.equal(paymentHash.hash);

      let transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.true;
      expect(transferReceiveResult.receivedStatechainIds).empty;

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin.statechain_id);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).not.empty;

      const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin.statechain_id, paymentHash.batchId);

      const hash = crypto.createHash('sha256')
          .update(Buffer.from(preimage, 'hex'))
          .digest('hex')

      expect(hash).to.equal(paymentHash.hash);

      const paymentHashSecond = "b1f55a2f2eabb08ed9d6e15a053a6ac84d04d1c017de5a42caaec98b8d2ff738"
      const invoiceSecond = await generateInvoice(paymentHashSecond, amount);

      try {
        await payInvoice(invoiceSecond.payment_request);
      } catch (error) {
        console.error('Error:', error);
        expect(error.message).to.include('failed');
      }
    })
  })

  context('Statecoin sender sends coin without batch_id (receiver should still be able to receive, but no pre-image revealed)', () => {
    it('should complete successfully', async () => {

      // await removeDatabase();
      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_11";
      let wallet_2_name = "w_ln_12";
      await createWallet(clientConfig, wallet_1_name);
      await createWallet(clientConfig, wallet_2_name);

      const token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      const tokenId = token.token_id;

      const amount = 10000;
      const depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      const tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      const usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      const listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin = listCoins[0];

      expect(coin.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin.statechain_id);

      const transferAddress = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin.statechain_id, transferAddress.transfer_receive, false, null);

      let transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).not.empty;

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin.statechain_id);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).is.empty;

      let hash;
      try {
        const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin.statechain_id, paymentHash.batchId);
        hash = crypto.createHash('sha256')
          .update(Buffer.from(preimage, 'hex'))
          .digest('hex')
        expect(hash).to.equal(paymentHash.hash);
      } catch (error) {
        console.error('Error:', error);
        expect(error.message).to.include('failed');
      }
    })
  })

  context('Sender sends coin without batch_id, and then resends to a different address (to attempt to steal), and then attempts to retrieve the pre-image, should fail (and LN payment cannot be claimed)', () => {
    it('should complete successfully', async () => {

      // await removeDatabase();
      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_13";
      let wallet_2_name = "w_ln_14";
      let wallet_3_name = "w_ln_15";
      await createWallet(clientConfig, wallet_1_name);
      await createWallet(clientConfig, wallet_2_name);
      await createWallet(clientConfig, wallet_3_name);

      const token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      const tokenId = token.token_id;

      const amount = 10000;
      const depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      const tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      const usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      const listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin = listCoins[0];

      expect(coin.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin.statechain_id);

      const transferAddress = await mercurynodejslib.newTransferAddress(clientConfig, wallet_2_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin.statechain_id, transferAddress.transfer_receive, false, null);

      const transferAddressSecond = await mercurynodejslib.newTransferAddress(clientConfig, wallet_3_name, null);

      await mercurynodejslib.transferSend(clientConfig, wallet_1_name, coin.statechain_id, transferAddressSecond.transfer_receive, false, null);
      
      let transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_3_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).not.empty;

      await mercurynodejslib.confirmPendingInvoice(clientConfig, wallet_1_name, coin.statechain_id);

      transferReceiveResult = await mercurynodejslib.transferReceive(clientConfig, wallet_2_name);

      expect(transferReceiveResult.isThereBatchLocked).is.false;
      expect(transferReceiveResult.receivedStatechainIds).is.empty;

      let hash;
      try {
        const { preimage } = await mercurynodejslib.retrievePreImage(clientConfig, wallet_1_name, coin.statechain_id, paymentHash.batchId);
        hash = crypto.createHash('sha256')
          .update(Buffer.from(preimage, 'hex'))
          .digest('hex')
        expect(hash).to.equal(paymentHash.hash);
      } catch (error) {
        console.error('Error:', error);
        expect(error.message).to.include('failed');
      }
    })
  })

  context('Coin receiver creates a non hold invoice, and sends to sender (i.e. an invoice with the a different payment hash). Sender should be able to determine this.', () => {
    it('should complete successfully', async () => {

      // await removeDatabase();
      const clientConfig = client_config.load();
      let wallet_1_name = "w_ln_16";
      await createWallet(clientConfig, wallet_1_name);

      const token = await mercurynodejslib.newToken(clientConfig, wallet_1_name);
      const tokenId = token.token_id;

      const amount = 10000;
      const depositInfo = await mercurynodejslib.getDepositBitcoinAddress(clientConfig, wallet_1_name, amount);

      const tokenList = await mercurynodejslib.getWalletTokens(clientConfig, wallet_1_name);
      const usedToken = tokenList.find(token => token.token_id === tokenId);

      expect(usedToken.spent).is.true;

      await depositCoin(clientConfig, wallet_1_name, amount, depositInfo);

      const listCoins = await mercurynodejslib.listStatecoins(clientConfig, wallet_1_name);

      expect(listCoins.length).to.equal(1);

      const coin = listCoins[0];

      expect(coin.status).to.equal(CoinStatus.CONFIRMED);

      const paymentHash = await mercurynodejslib.paymentHash(clientConfig, wallet_1_name, coin.statechain_id);

      const paymentHashSecond = "a3b5f72d4e8cb07cd9a6e17c054a7ac84d05e1c018fe5b43cbbef98a9d3ff839"
      const invoiceSecond = await generateInvoice(paymentHashSecond, amount);

      const isInvoiceValid = await mercurynodejslib.verifyInvoice(clientConfig, paymentHash.batchId, invoiceSecond.payment_request);
      expect(isInvoiceValid).is.false;
    })
  })
})
