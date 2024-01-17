import { useDispatch } from 'react-redux'
import { useState } from 'react'

import { walletActions } from '../store/wallet'
import deposit from './../logic/deposit';
import transferReceive from '../logic/transferReceive'

import WalletActivity from './WalletActivity';
import CoinItem from './CoinItem';

export default function WalletControl({ wallet }) {

  const dispatch = useDispatch();

  const [isGeneratingNewDepositAddress, setIsGeneratingNewDepositAddress] = useState(false);
  const [formData, setFormData] = useState({ token_id: '', statecoinAmount: '' });

  const handleFormSubmit = async (event) => {
    event.preventDefault();

    // validate the values before submitting
    if (formData.token_id == '') {
      console.log('not a valid token_id');
      return;
    }

    if (formData.statecoinAmount == '') {
      console.log('no valid statecoin amount entered');
      return;
    }

    let newAddress = await deposit.newAddress(wallet, formData.token_id, formData.statecoinAmount);
    await dispatch(walletActions.newDepositAddress(newAddress));

    // Reset the form data and close the form
    setFormData({ token_id: '', statecoinAmount: '' });
    setIsGeneratingNewDepositAddress(false);
  };

  const newDepositAddress = () => {
    setIsGeneratingNewDepositAddress(true);
  };

  const getNewTransferAddress = async () => {
    let newCoin = await transferReceive.newTransferAddress(wallet);
    await dispatch(walletActions.insertNewTransferCoin(newCoin));
  };

  const getNewToken = async () => {
    // generate a wallet ID object
    let newToken = await deposit.newToken();

    // create a dispatch object
    let dispatchWallet = {};
    dispatchWallet.newToken = newToken;
    dispatchWallet.walletName = wallet.name;

    // save to the wallet state
    await dispatch(walletActions.addNewToken(dispatchWallet));
    console.log(dispatchWallet);
  }


  let newTokenButton = <button className="fancy-button" onClick={getNewToken}>New Token</button>;
  let newDepositAddrButton = (
    <div>
      <button className="fancy-button" disabled={isGeneratingNewDepositAddress} onClick={newDepositAddress} style={{ marginRight: '10px', marginTop: '20px' }}>
        New Deposit
      </button>
      {isGeneratingNewDepositAddress && (
        <form onSubmit={handleFormSubmit}>
          <label>
            Token ID:
            <input type="text" value={formData.token_id} onChange={(e) => setFormData({ ...formData, token_id: e.target.value })} />
          </label>
          <label>
            Statecoin Amount:
            <input type="text" value={formData.statecoinAmount} onChange={(e) => setFormData({ ...formData, statecoinAmount: e.target.value })} />
          </label>
          <button type="submit">Submit</button>
        </form>
      )}
    </div>
  );
  let newTransferAddrButton = <button className="fancy-button" onClick={getNewTransferAddress}>New Transfer Address</button>;

  let tokensClone = structuredClone(wallet.tokens);

  let coinsClone = structuredClone(wallet.coins);
  coinsClone.reverse();

  let coinList = coinsClone.map((coin, index) =>
    <CoinItem key={index} coin={coin} wallet={wallet} />
  );

  let tokenList = tokensClone.map((token, index) => <div>Token ID: {token.token_id}</div>)

  let sortedActivities = wallet.activities.slice().sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });

  let walletActivityList =
    <ul style={{ marginTop: 10 }} >
      {sortedActivities.map((activity, index) =>
        <li key={index}><WalletActivity activity={activity} /></li>
      )}
    </ul>;

  return (
    <div style={{ marginTop: 15, padding: 15 }}>
      <div key={wallet.name}>
        <h3>Name: {wallet.name}</h3>
        <div>blockheight: {wallet.blockheight}</div>
      </div>
      <div>{newTokenButton}{newDepositAddrButton} {newTransferAddrButton}</div>
      <h3 style={{ marginTop: 20 }}>Tokens</h3>
      <div>{tokenList}</div>
      <h3 style={{ marginTop: 20 }}>Coins</h3>
      <div>{coinList}</div>
      <h3 style={{ marginTop: 20 }}>Activities</h3>
      <div>{walletActivityList}</div>
    </div>
  );
};