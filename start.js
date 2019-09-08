/*jslint node: true */
'use strict';
const constants = require('ocore/constants.js');
const conf = require('ocore/conf');
const db = require('ocore/db');
const eventBus = require('ocore/event_bus');
const validationUtils = require('ocore/validation_utils');
const headlessWallet = require('headless-obyte');
const objectHash = require('ocore/object_hash.js');
const network = require("ocore/network");

let steps = {}; // store user steps
let sellTempData = {}; // store seller's temp product data 
let assocDeviceAddressToAddress = {};

/**
 * headless wallet is ready
 */
eventBus.once('headless_wallet_ready', () => {
	headlessWallet.setupChatEventHandlers();

	/**
	 * user pairs his device with the bot
	 */
	eventBus.on('paired', (from_address, pairing_secret) => {
		// send a geeting message
		const device = require('ocore/device.js');
		device.sendMessageToDevice(from_address, 'text', "Welcome to the autonomous auctioneer!  [start](command:start) ");
	});

	/**
	 * user sends message to the bot
	 */
	eventBus.on('text', (from_address, text) => {
		// analyze the text and respond
		text = text.trim().toLowerCase();
		if (!steps[from_address]) steps[from_address] = 'start';
		let step = steps[from_address];
		const device = require('ocore/device.js');

		if (step === 'start') {
			device.sendMessageToDevice(from_address, 'text', "Welcome to the autonomous auctioneer!\n Press any key to start.");
			steps[from_address] = 'buyOrSell';
		} else if (step === 'buyOrSell') {
			switch (text) {
				case 'buyer':
					setTimeout(() => {
						network.requestFromLightVendor('light/get_aa_state_vars', {
							address: "CSHY6AJMJ7QYDHWRBD5MIA3V2MHJG2BY"
						}, (ws, request, response) => {

							var auctions = getData (response)
							console.error("response: "+response.toString())
							console.error("auctions: "+auctions.toString())
				

							//TODO 
							//check if auction_running==true
							//prepare and format overview, calculate prices, prepare links
							let message = prepareAuctionOverview(auctions)	

							//send response
							device.sendMessageToDevice(from_address, 'text', message);

							steps[from_address] = 'start';
						})

					}, 1000)
					break;
				case 'seller':
					device.sendMessageToDevice(from_address, 'text', "What do you want to sell? e.g. [An Apple](command:An Apple)");
					steps[from_address] = 'sell_description';
					break;
				default:
					device.sendMessageToDevice(from_address, 'text', "Buyer or Seller? [buyer](command:buyer) | [seller](command:seller)");
					break;
			}
		}

		else if (step === 'sell_description') {
			sellTempData[from_address] = { "seller": "true" }
			sellTempData[from_address]['product_description'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which price to start with? e.g. [500](command:500)");
			steps[from_address] = 'sell_startprice';
		}

		else if (step === 'sell_startprice') {
			sellTempData[from_address]['start_price'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which is the lowest price you want? e.g. [100](command:100)");
			steps[from_address] = 'sell_lowestprice';
		}

		else if (step === 'sell_lowestprice') {
			sellTempData[from_address]['lowest_price'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which price steps to use? e.g. [50](command:50)");
			steps[from_address] = 'sell_pricesteps';
		}

		else if (step === 'sell_pricesteps') {
			sellTempData[from_address]['price_steps'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which time steps to use? e.g. [3600](command:3600)");
			steps[from_address] = 'sell_startAuction';
		}

		else if (step === 'sell_startAuction') {
			sellTempData[from_address]['time_steps'] = text;

			//sellTempData[from_address].forEach(logMapElements);
			//device.sendMessageToDevice(from_address, 'text', "Summary: " + sellTempData[from_address]['description'] + " " +sellTempData[from_address]['price'] );

			let base64data = Buffer.from(JSON.stringify(sellTempData[from_address])).toString('base64');
			let encodedbase64data = encodeURIComponent(base64data);

			//start auction
			device.sendMessageToDevice(from_address, 'text', "[create auction](byteball:CSHY6AJMJ7QYDHWRBD5MIA3V2MHJG2BY?amount=11000&base64data=" + encodedbase64data + ")");


			steps[from_address] = 'start';
		}
	});

});


/**
 * user pays to the bot
 */
eventBus.on('new_my_transactions', (arrUnits) => {
	// handle new unconfirmed payments
	// and notify user

	//	const device = require('ocore/device.js');
	//	device.sendMessageToDevice(device_address_determined_by_analyzing_the_payment, 'text', "Received your payment");
});

/**
 * payment is confirmed
 */
eventBus.on('my_transactions_became_stable', (arrUnits) => {
	// handle payments becoming confirmed
	// and notify user

	//	const device = require('ocore/device.js');
	//	device.sendMessageToDevice(device_address_determined_by_analyzing_the_payment, 'text', "Your payment is confirmed");
});

process.on('unhandledRejection', up => { throw up; });

/*
* Helper functions
*/

function getData(auctions_flat){
	var auctions = {}
	//parse response
	for (let k of Object.keys(auctions_flat)) {
		let pair = new Array()

		pair = k.split('.')
		let productID = pair[0]
		let productParam = ""
		if (pair.length == 2) {
			productParam = pair[1]

			if (!auctions[productID]) auctions[productID] = {};

			auctions[productID][productParam] = auctions_flat[k];
		}
	}
	return auctions
}

function prepareAuctionOverview(auctions){
	var message;
	message = "The following acutions are currently running. Click to bid!\n\n"

	for (let k of Object.keys(auctions)) {

		//work arround
		if (auctions[k]['bid']) continue;
		//console.error("keys from" +k +": "+Object.keys(auctions[k]) + "\n")

		// calucalate current price
		var start_price = auctions[k]['start_price'].valueOf();
		var timestamp_now = new Date().valueOf()
		var timestamp =  auctions[k]['timestamp']+"000".valueOf();
		var time_steps =  auctions[k]['time_steps'].valueOf();
		var price_steps =  auctions[k]['price_steps'].valueOf();
		var lowest_price = auctions[k]['lowest_price'].valueOf();
		var noSteps = ((timestamp_now - timestamp) / (time_steps * 1000)).toFixed(0)

		var current_price = start_price - (noSteps * price_steps)
		if (current_price < lowest_price) current_price = lowest_price
		//add 10000 for fees
		current_price = parseInt(current_price) + 10000

		// create buy link
		var link_data = { 
			"buyer"  :  "1", 
			"reference"   :  k
		}

		let base64data = Buffer.from(JSON.stringify(link_data)).toString('base64');
		let encodedbase64data = encodeURIComponent(base64data);
	    let buylink = "Bid for product: [bid for product](byteball:CSHY6AJMJ7QYDHWRBD5MIA3V2MHJG2BY?amount=" + current_price + "&base64data=" + encodedbase64data + ")"
		console.error("buylink: " +buylink)

		message += "**"+auctions[k]['product_description'] +"**\n"
		message += "Current_price: " + current_price +"\n"		
		//message += "start_price: " + auctions[k]['start_price'] +"\n"
		//message += "lowest_price: " + auctions[k]['lowest_price'] +"\n"
		//message += "time_steps: " + auctions[k]['time_steps'] +"\n"
		message += buylink +"\n"
		message += "---------------------------\n\n"
		//message += "price_steps: " + auctions[k]['price_steps'] +"\n\n"
	}

	return message;
}