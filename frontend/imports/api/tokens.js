import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import Auctions from './auctions.js';
import Auctionlets from './auctionlets.js';
import Transactions from './transactions.js';
import prettyError from '../utils/prettyError.js';

const Tokens = new Mongo.Collection(null);
const APPROVE_GAS = 1000000;

const tokens = {
  kovan: {
    ETH: '0x53eccc9246c1e537d79199d0c7231e425a40f896',
    MKR: '0x4bb514a7f83fbb13c2b41448208e89fabbcfe2fb',
  },
  live: {
    ETH: '0xecf8f87f810ecf450940c9f60066b4a7a501d6a7',
    MKR: '0xc66ea802717bfb9833400264dd12c2bceaa34a6d',
  },
};

Session.set('buying', localStorage.getItem('buying') || 'ETH');
Session.set('selling', localStorage.getItem('selling') || 'MKR');

Tokens.initialize = function initialize(network) {
  ERC20.init(network);
};

Tokens.getTokenAddress = function getTokenAddress(network, symbol) {
  return tokens[network][symbol];
};

Tokens.getToken = function getToken(symbol, callback) {
  const network = Session.get('network');
  if (!(network in tokens)) {
    console.log('unknown environment: ', network);
    callback('Unknown environment', null);
    return;
  }
  if (!(symbol in tokens[network])) {
    console.log('unknown token');
    callback(`Unknown token "${symbol}"`, null);
    return;
  }

  const address = Tokens.getTokenAddress(network, symbol);
  try {
    ERC20.classes.ERC20.at(address, (error, token) => {
      if (!error) {
        callback(false, token);
      } else {
        callback(error, token);
      }
    });
  } catch (e) {
    callback(e, null);
  }
};

/**
 * Syncs the buying and selling' balances and allowances of selected account,
 * usually called for each new block
 */
Tokens.sync = function sync() {
  const network = Session.get('network');
  const address = Session.get('address');
  if (address && network) {
    web3.eth.getBalance(address, (error, balance) => {
      const newETHBalance = balance.toString(10);
      if (!error && !Session.equals('ETHBalance', newETHBalance)) {
        Session.set('ETHBalance', newETHBalance);
      }
    });

    const allTokens = _.uniq([Session.get('buying'), Session.get('selling')]);

    if (network !== 'private') {
      // Sync token balances and allowances asynchronously
      // for(let token_id in allTokens) {
      allTokens.forEach((tokenId) => {
        // XXX EIP20
        Tokens.getToken(tokenId, (error, token) => {
          if (!error) {
            token.balanceOf(address, (balanceError, balance) => {
              if (!balanceError) {
                Tokens.upsert({ name: tokenId, address: token.address },
                { $set: { balance: balance.toString(10) } });
              }
            });
            token.allowance(address, Session.get('contractAddress'), (allowanceError, allowance) => {
              if (!allowanceError) {
                Tokens.upsert({ name: tokenId, address: token.address },
                { $set: { allowance: allowance.toString(10) } });
              }
            });
          }
        });
      });
    } else {
      allTokens.forEach((tokenId) => {
        console.log('NETWORK IS PRIVATE');
        Tokens.upsert(allTokens[tokenId], { $set: { balance: '0', allowance: '0' } });
      });
    }
  }
};

Tokens.isBalanceSufficient = function isBalanceSufficient(bid, tokenAddress) {
  const token = Tokens.findOne({ address: tokenAddress });
  if (token !== undefined && web3.toBigNumber(token.balance).gte(web3.toBigNumber(bid))) {
    // console.log('Success! Balance is', token.balance, 'and bid is', bid.toString(10));
    return true;
  } else if (token !== undefined) {
    console.log('Insufficient! Balance is', token.balance, 'and bid is', bid.toString(10));
    return false;
  }
  console.log('token is not found', tokenAddress);
  return false;
};

Tokens.setEthAllowance = function setEthAllowance(amount) {
  Tokens.getToken('ETH', (error, token) => {
    if (!error) {
      token.approve(Session.get('contractAddress'), amount, { gas: APPROVE_GAS }, (approveError, result) => {
        if (!approveError) {
          console.log('Eth approve transaction adding');
          Session.set('bidProgress', 33);
          Session.set('newBidMessage', {
            message: '<i class="fa fa-spinner fa-pulse fa-fw"></i> Setting allowance for bid <i>(this can take a while)</i>',
            type: 'info' });
          Transactions.add('ethallowance', result, { value: amount.toString(10) });
        } else {
          console.log('SetEthAllowance error:', approveError);
          Session.set('bidProgress', 0);
          Session.set('newBidMessage', {
            message: `Error setting allowance for bid: ${prettyError(approveError)}`,
            type: 'danger' });
        }
      });
    } else {
      Session.set('bidProgress', 0);
      Session.set('newBidMessage', {
        message: `Error setting allowance for bid: ${prettyError(error)}`,
        type: 'danger' });
    }
  });
};

Tokens.watchEthApproval = function watchEthApproval() {
  Tokens.getToken('ETH', (error, token) => {
    if (!error) {
      /* eslint-disable new-cap */
      token.Approval({ owner: Session.get('address'), spender: Session.get('contractAddress') },
      (approvedError) => {
        if (!approvedError) {
          console.log('Approved, placing bid');
        }
      });
      /* eslint-enable new-cap */
    }
  });
};

Tokens.watchMkrApproval = function watchMkrApproval() {
  Tokens.getToken('MKR', (error, token) => {
    if (!error) {
      /* eslint-disable new-cap */
      token.Approval({ owner: Session.get('address'), spender: Session.get('contractAddress') },
      (approvalError) => {
        if (!approvalError) {
          console.log('Approved, creating auction');
        }
      });
      /* eslint-enable new-cap */
    }
  });
};

Tokens.watchEthAllowanceTransactions = function watchEthAllowanceTransactions() {
  Transactions.observeRemoved('ethallowance', (document) => {
    if (document.receipt.logs.length === 0) {
      console.log('Setting ETH allowance went wrong');
      Session.set('bidProgress', 0);
      Session.set('newBidMessage', { message: 'Error setting allowance for bid', type: 'danger' });
    } else {
      console.log('ETH allowance is set');
      const auction = Auctions.findAuction();
      Session.set('bidProgress', 66);
      Session.set('newBidMessage', {
        message: '<i class="fa fa-spinner fa-pulse fa-fw"></i> Allowance set, placing bid <i>(this can take a while)</i>',
        type: 'info' });
      Auctionlets.bidOnAuctionlet(Session.get('currentAuctionletId'), document.object.value, auction.sell_amount);
    }
  });
};

export default Tokens;
