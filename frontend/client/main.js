import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Meteor } from 'meteor/meteor';
import { Auctions } from '/imports/api/auctions.js';
import { Auctionlets } from '/imports/api/auctionlets.js';
import './main.html';
import '/imports/startup/client/index.js';

var dapple = new tokenauction.class(web3, 'morden');
web3.eth.defaultAccount = web3.eth.accounts[0];

Template.auction.viewmodel({
  auction: function () {
    var singleAuction = Auctions.findOne({"auctionId": Meteor.settings.public.auctionId});
    return singleAuction;
  }
});

Template.auctionlet.viewmodel({
  auctionlet: function() {
    var singleAuctionlet = Auctionlets.findOne({"auctionletId": Meteor.settings.public.auctionletId});
    console.log('auctionlet: ', singleAuctionlet)
    return singleAuctionlet;
  }
});

Template.allowance.viewmodel({
  create: function(event) {
    event.preventDefault();
    
    erc20.class(web3);
    var eth = erc20.classes.ERC20.at(Meteor.settings.public.ETH.address);
    
    eth.balanceOf(web3.eth.accounts[0], function(error, result) {
      if(!error) {
        console.log(result.toNumber());
      }
      else {
        console.log(error);
      }
    })
    
    eth.approve(dapple.objects.auction.address, 10000, {gas: 500000 });
    var mkr = erc20.classes.ERC20.at(Meteor.settings.public.MKR.address);
    mkr.approve(dapple.objects.auction.address, 10000, {gas: 500000 });
    
  }
});

Template.placebid.viewmodel({
  create: function(event) {
    event.preventDefault();
    
    dapple.objects.auction.Bid(function (error, result) {
      if(!error) {
        console.log(result);
      }
      else {
        console.log("error: ", error);
      }
    })
    dapple.objects.auction.newBid(2, web3.eth.accounts[0], 15, {gas: 500000 }, function (error, result) {
      if(!error) {
        console.log(result);
      }
      else {
        console.log("error: ", error);
      }
    })
  }
});

Template.newauction.viewmodel({
  sellamount: 0,
  startbid: 0,
  minimumincrease: 0,
  duration: 0,
  create: function(event) {
    event.preventDefault();

    dapple.objects.auction.NewAuction(function (error, result) {
      if(!error) {
        console.log("AuctionId: ", result.args.id.toNumber());
        console.log("BaseId: ", result.args.base_id.toNumber());
      }
      else {
        console.log("error: ", error);
      }
    });

    dapple.objects.auction.newAuction(web3.eth.accounts[0], Meteor.settings.public.ETH.address, 
    Meteor.settings.public.MKR.address, this.sellamount(), this.startbid(), this.minimumincrease(), this.duration(), 
    {gas: 4700000 }, function (error, result) {
      if(!error) {
          console.log('New auction transaction started')
      }
      else {
          console.log(error);
      }
    });
  }
});

Template.getauctions.viewmodel({
  auctions: function () {
    return Auctions.find({});
  },
  click: function(event) {
    event.preventDefault();
    Auctions.remove({})
    //Get the auction info and auctionlets information
    dapple.objects.auction.NewAuction({}, { fromBlock: Meteor.settings.public.auctionFromBlock }, function (error, trade) {
      if (!error) {
        if(!Auctions.findOne({id: trade.args.id.toNumber()})) {
          Auctions.insert({id: trade.args.id.toNumber(), base_id: trade.args.base_id.toNumber()})
        }        
      }
    })
  }
})

