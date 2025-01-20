import axios from 'axios';
import clientConfig from './ClientConfig.js';

const generateBlocks = async (blocks) => {
    const body = {
        blocks
    };

    const url = `http://0.0.0.0:3000/generate_blocks`;

    let response = await axios.post(url, body);

    if (response.status != 200) {
        throw new Error(`Failed to generate new blocks`);
    }
}

const depositCoin = async (address, amount) => {

    const body = {
        address,
        amount
    };

    const url = `http://0.0.0.0:3000/deposit_amount`;
    
    let response = await axios.post(url, body);

    if (response.status != 200) {
        throw new Error(`Failed to unlock transfer message`);
    }
} 

const testEsplora = async () => {

    const response = await axios.get(`${clientConfig.esploraServer}/api/blocks/tip/height`);
    const block_header = response.data;
    console.log(block_header);
}

const sleep = (ms) => {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const generateInvoice = async (paymentHash, amountInSats) => {

    const body = {
        paymentHash,
        amountInSats
    };

    const url = `http://0.0.0.0:3000/generate_invoice`;
    
    let response = await axios.post(url, body);

    if (response.status == 200) {
        const invoice = JSON.parse(response.data.invoice);
        return invoice;
    } else {
        throw new Error(`Failed to generate invoice`);
    }
}

const payInvoice = async (paymentRequest) => {

    const body = {
        paymentRequest
    };

    const url = `http://0.0.0.0:3000/pay_invoice`;
    
    let response = await axios.post(url, body);

    if (response.status != 200) {
        throw new Error(`Failed to pay invoice`);
    }
}

const payHoldInvoice = async (paymentRequest) => {

    const body = {
        paymentRequest
    };

    const url = `http://0.0.0.0:3000/pay_holdinvoice`;
    
    let response = await axios.post(url, body);

    if (response.status != 200) {
        throw new Error(`Failed to pay hold invoice`);
    }
}

const settleInvoice = async (preimage) => {

    const body = {
        preimage
    };

    const url = `http://0.0.0.0:3000/settle_invoice`;
    
    let response = await axios.post(url, body);

    if (response.status != 200) {
        throw new Error(`Failed to settle invoice`);
    }
}

const decodeInvoice = async (paymentRequest) => {
    const body = {
        paymentRequest
    };

    const url = `http://0.0.0.0:3000/decode_invoice`;
    
    let response = await axios.post(url, body);

    if (response.status == 200) {
        const invoice = response.data.invoice;
        return invoice;
    } else {
        throw new Error(`Failed to decode invoice`);
    }
}

const checkDepositsConfirmation = async (address) => {
    let allDepositsConfirmed = false;
    const startTime = Date.now();
    const timeoutDuration = 60000; // 1 minute in milliseconds
    
    while (Date.now() - startTime < timeoutDuration) {

        const response = await axios.get(`${clientConfig.esploraServer}/api/address/${address}/utxo`);
        const transactions = response.data;

        // Check if all transactions are confirmed
        const allConfirmed = transactions.every(tx => tx.status.confirmed === true);
        
        if (allConfirmed) {
            allDepositsConfirmed = true;
            console.log('All deposits confirmed!');
            break;
        }
        
        // Wait for 2 seconds before next check
        await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return allDepositsConfirmed;
}

const handleTokenResponse = async (tokenResponse) => {

    let tokenId = tokenResponse.token_id;

    if (tokenResponse.payment_method == "onchain") {

        console.log(">>>>>>>>>>>> Onchain payment method");

        let remainingBlocks = tokenResponse.confirmation_target;
        let depositAddress = tokenResponse.deposit_address;

        let amount = tokenResponse.fee;

        await depositCoin(depositAddress, amount);

        await generateBlocks(remainingBlocks);

        await checkDepositsConfirmation(depositAddress);

        console.log(">>>>>>>>>>>> Deposit confirmed");
    }

    return tokenId;
}

export { 
    generateBlocks, 
    depositCoin, 
    sleep, 
    generateInvoice, 
    payInvoice, 
    payHoldInvoice, 
    settleInvoice, 
    decodeInvoice, 
    handleTokenResponse, 
    checkDepositsConfirmation 
};
