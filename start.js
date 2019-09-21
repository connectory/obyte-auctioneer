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

//the address of the a. agent
let aa_addess = "2EBQW3IICBBBXBQQX6CLTOH2CTUHGNSS"

let mainMenuText= "\n -> [buy](command:buy) \n -> [sell](command:sell) \n -> [confirm data sent to seller](command:confirm_data_sent)"

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
		device.sendMessageToDevice(from_address, 'text', "Welcome to the autonomous auctioneer! Press [start](command:start) to start");	
	});

	/**
	 * user sends message to the bot
	 */
	eventBus.on('text', (from_address, text) => {
		text = text.trim().toLowerCase();

		// initialize state machine
		if (!steps[from_address]) steps[from_address] = 'start';
		let step = steps[from_address];

		const device = require('ocore/device.js');

		//state machine: start
		if (step === 'start') {
			device.sendMessageToDevice(from_address, 'text', "What do you want to do? "+mainMenuText);
			steps[from_address] = 'mainMenu';		

		//state machine: mainMenu	
		} else if (step === 'mainMenu') {
			switch (text) {
				case 'buy':
					setTimeout(() => {
						network.requestFromLightVendor('light/get_aa_state_vars', {
							address: aa_addess
						}, (ws, request, response) => {

							//get auction data 
							var auctions = getData(response)

							//prepare message
							let message = prepareAuctionOverview(auctions)

							//send response
							device.sendMessageToDevice(from_address, 'text', message);

							steps[from_address] = 'mainMenu';
						})

					}, 1000)
					break;
				case 'sell':
					device.sendMessageToDevice(from_address, 'text', "What do you want to sell? e.g. [An Apple](suggest-command:An Apple)");
					steps[from_address] = 'sell_description';
					break;
				case 'confirm_data_sent':
					setTimeout(() => {
						network.requestFromLightVendor('light/get_aa_state_vars', {
							address: aa_addess
						}, (ws, request, response) => {

							//get auction data 
							var auctions = getData(response)

							//prepare message
							console.error("from_address "+from_address)
							let message = prepareMyWonAuctionOverview(auctions,from_address)

							//send response
							device.sendMessageToDevice(from_address, 'text', message);

							steps[from_address] = 'mainMenu';
						})
					}, 1000)
					break;			
				default:
					device.sendMessageToDevice(from_address, 'text', "No valid option here. What do you want to do? "+mainMenuText);
					break;
			}
		}

		//state machine: sell steps
		else if (step === 'sell_description') {
			sellTempData[from_address] = { "seller": "true" }
			sellTempData[from_address]['product_description'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which price to start with? e.g. [500](suggest-command:500)");
			steps[from_address] = 'sell_startprice';
		}

		else if (step === 'sell_startprice') {
			sellTempData[from_address]['start_price'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which is the lowest price you want? e.g. [100](suggest-command:100)");
			steps[from_address] = 'sell_lowestprice';
		}

		else if (step === 'sell_lowestprice') {
			sellTempData[from_address]['lowest_price'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which price steps to use? e.g. [50](suggest-command:50)");
			steps[from_address] = 'sell_pricesteps';
		}

		else if (step === 'sell_pricesteps') {
			sellTempData[from_address]['price_steps'] = text;

			device.sendMessageToDevice(from_address, 'text', "Which time steps to use? e.g. [3600](suggest-command:3600)");
			steps[from_address] = 'sell_startAuction';
		}

		else if (step === 'sell_startAuction') {
			sellTempData[from_address]['time_steps'] = text;
			
			let base64data = Buffer.from(JSON.stringify(sellTempData[from_address])).toString('base64');
			let encodedbase64data = encodeURIComponent(base64data);

			//start auction
			device.sendMessageToDevice(from_address, 'text', "[create auction](byteball:" + aa_addess + "?amount=11000&base64data=" + encodedbase64data + ")");

			steps[from_address] = 'mainMenu';
		}
	});

});


/**
 * user pays to / sends data to the bot 
 */
eventBus.on('new_my_transactions', (arrUnits) => {
	// handle new unconfirmed payments
	// and notify user

	console.error("new_my_transactions")
});

/**
 * payment is confirmed
 */
eventBus.on('my_transactions_became_stable', (arrUnits) => {
	// handle payments becoming confirmed
	// and notify user

	console.error("my_transactions_became_stable")

	//	const device = require('ocore/device.js');
	//	device.sendMessageToDevice(device_address_determined_by_analyzing_the_payment, 'text', "Your payment is confirmed");
});

eventBus.on("object", (from_address, body, message_counter) => {

	console.error("body: " + body)
});

process.on('unhandledRejection', up => { throw up; });

/*
* Helper functions
*/

//transform the flat map to a proper data structure
function getData(auctions_flat) {
	var auctions = {}
	//parse response
	for (let k of Object.keys(auctions_flat)) {
		let pair = new Array()

		if (k.startsWith('auction.')) {
			// e.g. 'auction.$reference.timestamp'
			pair = k.split('.')
			let auctionID = pair[1]
			let auctionParam = pair[2]

			if (!auctions[auctionID]) auctions[auctionID] = {};
			auctions[auctionID][auctionParam] = auctions_flat[k];
		}
	}
	return auctions
}

function prepareAuctionOverview(auctions) {
	var message;
	message = "The following auctions are currently running. Click to bid:\n\n"

	var counter_running_auctions = 0

	for (let k of Object.keys(auctions)) {

		//do not show finished auctions
		var auction_status = auctions[k]['auction_status']
		if (auction_status != 'running') continue

		else counter_running_auctions += 1

		// calucalate current price
		var start_price = auctions[k]['start_price'].valueOf();
		var timestamp_now = new Date().valueOf()
		var timestamp = auctions[k]['timestamp'] + "000".valueOf();
		var time_steps = auctions[k]['time_steps'].valueOf();
		var price_steps = auctions[k]['price_steps'].valueOf();
		var lowest_price = auctions[k]['lowest_price'].valueOf();
		var noSteps = ((timestamp_now - timestamp) / (time_steps * 1000)).toFixed(0)
		var current_price = start_price - (noSteps * price_steps)

		//set current prise to lowest price if it is reached / overreached
		if (current_price < lowest_price) current_price = lowest_price

		//add 10000 for fees
		current_price = parseInt(current_price) + 10000

		// create buy link
		var link_data = {
			"buyer": "1",
			"reference": k
		}

		let base64data = Buffer.from(JSON.stringify(link_data)).toString('base64');
		let encodedbase64data = encodeURIComponent(base64data);
		let buylink = "Bid for product: [bid for product](byteball:" + aa_addess + "?amount=" + current_price + "&base64data=" + encodedbase64data + ")"
		console.error("buylink: " + buylink)

		message += "**" + auctions[k]['product_description'] + "**\n"
		message += "Current_price: " + current_price + "\n"
		message += buylink + "\n"
		message += "---------------------------\n\n"
	}

	if (counter_running_auctions == 0 ) message = message + "-\n"

	message += 	"Do something else? "+mainMenuText

	return message;
}

function prepareMyWonAuctionOverview(auctions, buyerID) {
	var message;
	message = "You won the following auctions. For which one you want to confirm data received from the seller?:\n\n"

	var my_auctions = 0

	for (let k of Object.keys(auctions)) {

		//only my auctions with status "holding"	
		var auction_status = auctions[k]['auction_status']
		console.error("auction_status "+ auction_status +"\n")
		if (auction_status != 'holding') continue
	
		//TODO find out how to get the buyerID (it is not from_address!)
		//var buyer = auctions[k]['buyer'].valueOf();
		//console.error("buyer "+ buyer +"\n")
		//console.error("buyerID "+ buyerID +"\n\n")
		//if (buyerID != buyer) continue
		
		my_auctions += 1

		// get interested data
		var product_description = auctions[k]['product_description'].valueOf();
		var timestamp = auctions[k]['timestamp'] + "000".valueOf();
		var seller = auctions[k]['seller'].valueOf();

		// create confirm link
		var link_data = {
			"buyer_data_confirm": "1",
			"reference": k
		}

		let base64data = Buffer.from(JSON.stringify(link_data)).toString('base64');
		let encodedbase64data = encodeURIComponent(base64data);
		let confirmLink = "Confirm data received: [confirm](byteball:" + aa_addess + "?amount=10000" + "&base64data=" + encodedbase64data + ")"
		console.error("buylink: " + confirmLink)

		message += "**" + auctions[k]['product_description'] + "**\n"
		message += "Bought from seller: " + seller + "\n"
		message += "Auction finished time: " + timestamp + "\n"
		message += confirmLink + "\n"
		message += "---------------------------\n\n"
	}

	if (my_auctions == 0 ) message = message + "-\n"

	message += 	"Do something else? "+mainMenuText

	return message;
}