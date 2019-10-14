/*jslint node: true */
'use strict';

const crypto = require('crypto')

const constants = require('ocore/constants.js');
const conf = require('ocore/conf');
const db = require('ocore/db');
const eventBus = require('ocore/event_bus');
const validationUtils = require('ocore/validation_utils');
const headlessWallet = require('headless-obyte');
const objectHash = require('ocore/object_hash.js');
const network = require("ocore/network");

const { generateKeyPairSync } = require('crypto')

let steps = {}; // store user steps
let tempData = {}; // store seller's temp product data 

const maxNumAuctionsToShow = 10;

//the address of the autonomous agent
let aa_addess = "6Y4MHVF22KFJYY6LJBDU5GVOIUGPHAVF"

//Messages
const message_mainMenuText = `
o [Create an auction](command:create) 
o [Bid on an auction](command:bid)
o [Get the buyer's pairing code](command:get_pairing_code) 
o [Confirm data sent to seller](command:confirm)
o [Rate a seller (as buyer)](command:buyer_vote)
`

const message_welcome = `
Welcome to the Autonomous Auctioneer!

With the Autonomous Auctioneer you can create and bid on auctions.
More details on it have a look here. [link to Steemit Artikel]. 

Type [menu](command:menu) to start.
You can always type menu to get back to the main menu.
`

const message_mainMenuDoSomethingElsePrefix = "\n\nDo something else? ";
const message_mainMenuPrefix = "What do you want to do? ";

const message_ConfirmWhichAddress = "From which address has the transaction been made? (Use the menu \"Insert my address\")"

const message_VoteGoodsReceived = "Did you receive the goods? [Yes](command:yes) | [No](command:no)";
const message_VoteWhatIsYourVote = "What is your voting? [very good](command:5) | [good](command:4) | [neutral](command:3) | [bad](command:2) | [very bad](command:1)";
const message_VoteWhatIsYourComment = "What is your comment? [Everything fine, thanks.](suggest-command:Everything fine, thanks.)";
const message_VoteUsedThisVoteLink = "Use this link to send your rating: [link](byteball:";

const message_SellPairingCode = `What is your pairing code?
It will be encrypted with the seller's public key before publishing it.
You find the pairing code as follows:
o Press the back button
o Add new device
o Invite the other device
`
const message_SellDescription = "What do you want to sell? e.g. [An Apple](suggest-command:An Apple)";
const message_SellStartPrice = "Which price to start with? e.g. [500](suggest-command:500)";
const message_SellLowestPrice = "Which is the lowest price you want? e.g. [100](suggest-command:100)";
const message_SellPriceSteps = "Which price steps to use? e.g. [50](suggest-command:50)";
const message_SellTimeSteps = "Which time steps to use? e.g. [3600](suggest-command:3600)";
const message_SellEncryptAlgo = "Which type of asymetric encryption do you want to use for the pairing key exchange? Currently only [AES](command:AES) supported by the bot.";
const message_SellPublicKey = "Paste your public key (to be used by the buyer to encrypt the pairing key). [I don't have one, generate a key pair for me](command:generate_keypair)"
const message_SellKeyNotAValidKey = "Not a valid public key, please create a new keypair and paste the public key again.";
const message_SellKeyPublicKey = "This is your generated public key:\n\n";
const message_SellKeyPrivateKey = "This is your generated privated key. Don't forget store it somewhere to be used for later decryption of the buyer's pairing key:\n\n";
const message_SellStartAuction = "Used this payment link to start the auction: [create auction](byteball:";

const message_PairingWhatIsYourPrivateKey = `"What is your private key?
Scroll back up to find it, in case you have not stored it and copy it including "-----BEGIN PRIVATE KEY-----" at the beginning and "-----END PRIVATE KEY-----" at the end.`
const message_PairingOverviewFinishedAuctionsForSeller = "This is the overview of your finished auctions:\n";
const message_PairingGetInContact = `\n\nYou can now get in contact with the buyer to exchange data to be able to send your goods by going to the "Chat" Tab of the wallet (bottom right) → "Add new device" → "Accept invitation from the other device" → Copy and paste the decrypted pairing code.`;

const message_BuyYouWonTheFollowinAuctions = "You won the following auctions. For which one you want to confirm that you have sent your data to the seller?:\n";
const message_BuyYouCanVoteForTheFollowinAuctions = "You can rate for the following auctions: \n";
const message_BuyBidForProductPrefix = "Bid for product: [bid for product](byteball:";
const message_BuyOverview = "The following auctions are currently running. Click to bid:\n";



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
		device.sendMessageToDevice(from_address, 'text', message_welcome);
	});

	/**
	 * user sends message to the bot
	 */
	eventBus.on('text', (from_address, text) => {
		text = text.trim();

		// initialize state machine
		if (!steps[from_address]) steps[from_address] = 'mainMenu';
		let step = steps[from_address];

		const device = require('ocore/device.js');

		//state machine: mainMenu	
		if (text.toLowerCase() == "menu" || step === 'mainMenu') {
			switch (text.toLowerCase()) {
				case 'bid':					
					device.sendMessageToDevice(from_address, 'text', message_SellPairingCode);
					steps[from_address] = 'buyer_pairing_code';
					break;
				case 'create':
					device.sendMessageToDevice(from_address, 'text', message_SellDescription);
					steps[from_address] = 'sell_description';
					break;
				case 'confirm':
					device.sendMessageToDevice(from_address, 'text', message_ConfirmWhichAddress);
					steps[from_address] = 'confirm_data_sent_2';
					break;
				case 'get_pairing_code':
					device.sendMessageToDevice(from_address, 'text', message_ConfirmWhichAddress);
					steps[from_address] = 'get_pairing_code_2';
					break;			
				case 'buyer_vote':
					device.sendMessageToDevice(from_address, 'text', message_ConfirmWhichAddress);
					steps[from_address] = 'buyer_vote_1';
					break;
				default:
					steps[from_address] = 'mainMenu';
					device.sendMessageToDevice(from_address, 'text', message_mainMenuPrefix + message_mainMenuText);
					break;
			}
		}

		//state machine: get pairing code steps
		else if (step === 'get_pairing_code_2') {
			tempData[from_address] = { "seller_address": text }

			device.sendMessageToDevice(from_address, 'text', "Do you want me to decrypt the pairing code of the buyer or do you want to do it outside of this Chatbot on your own? Type [Yes](command:yes) (if you want me to do it) or [No](command:no).");
			steps[from_address] = 'get_pairing_code_3';
		}

		else if (step === 'get_pairing_code_3') {
			let next_step = false
			let private_key = ""
			if (text.toLowerCase() == "yes"){
				device.sendMessageToDevice(from_address, 'text', message_PairingWhatIsYourPrivateKey);
			}
			else if (text.toLowerCase() == "no")
			{	
				private_key = "do_not_decrypt"
				next_step = true
			}
			else {
				private_key = text
				next_step = true
			}
	
			if (next_step){
				let seller_address = tempData[from_address]['seller_address']

				setTimeout(() => {
					network.requestFromLightVendor('light/get_aa_state_vars', {
						address: aa_addess
					}, (ws, request, response) => {

						//get auction data 
						var auctions = getData(response)

						//prepare message
						let message = prepareAuctionOverviewAsSeller(auctions,seller_address,private_key)

						//send response
						device.sendMessageToDevice(from_address, 'text', message);
					})
				}, 1000)
				steps[from_address] = 'mainMenu';
			}
		}

		//state machine: buyer steps
		else if (step === 'buyer_pairing_code') {
			let pairing_code = text

			setTimeout(() => {
				network.requestFromLightVendor('light/get_aa_state_vars', {
					address: aa_addess
				}, (ws, request, response) => {
	
					//get auction data 
					var auctions = getData(response)
	
					//prepare message
					let message = prepareAuctionOverview(auctions, pairing_code)
	
					//send response
					device.sendMessageToDevice(from_address, 'text', message);
				})
	
			}, 1000)
			steps[from_address] = 'mainMenu';
		}

		//state machine: buyer_vote steps
		else if (step === 'buyer_vote_1') {
			let buyer_address = text

			setTimeout(() => {
				network.requestFromLightVendor('light/get_aa_state_vars', {
					address: aa_addess
				}, (ws, request, response) => {

					//get auction data 
					var auctions = getData(response)

					//prepare message
					let message = prepareMyConfirmedAuctionOverview(auctions, buyer_address)

					//send response
					device.sendMessageToDevice(from_address, 'text', message);

					steps[from_address] = 'buyer_vote_2';
				})
			}, 1000)
		}

		else if (step === 'buyer_vote_2') {
			tempData[from_address] = { "reference": text }

			device.sendMessageToDevice(from_address, 'text', message_VoteGoodsReceived);
			steps[from_address] = 'buyer_vote_3';
		}
				
		else if (step === 'buyer_vote_3') {
			tempData[from_address]["goodReceived"] =  text

			device.sendMessageToDevice(from_address, 'text', message_VoteWhatIsYourVote);
			steps[from_address] = 'buyer_vote_4';
		}

		else if (step === 'buyer_vote_4') {
			tempData[from_address]["voting"] =  text

			device.sendMessageToDevice(from_address, 'text', message_VoteWhatIsYourComment);
			steps[from_address] = 'buyer_vote_5';
		}

		else if (step === 'buyer_vote_5') {
			tempData[from_address]["comment"] =  text

			// create vote link
			var link_data;
			if (tempData[from_address]["goodReceived"]  == "yes") link_data = {
				"reference": tempData[from_address]["reference"],
				"goods_receipt": "1",
				"voting": tempData[from_address]["voting"],
				"comment": tempData[from_address]["comment"]
			}

			else link_data = {
				"reference": tempData[from_address]["reference"],
				"no_goods_receipt": "1",
				"voting": tempData[from_address]["voting"],
				"comment": tempData[from_address]["comment"]
			}

			let base64data = Buffer.from(JSON.stringify(link_data)).toString('base64');
			let encodedbase64data = encodeURIComponent(base64data);
			let message = message_VoteUsedThisVoteLink + aa_addess + "?amount=10000&base64data=" + encodedbase64data + ")"

			message += message_mainMenuDoSomethingElsePrefix + message_mainMenuText

			device.sendMessageToDevice(from_address, 'text', message);
			steps[from_address] = 'mainMenu';
		}

		//state machine: confirm_data_sent steps
		else if (step === 'confirm_data_sent_2') {
			let buyer_address = text

			setTimeout(() => {
				network.requestFromLightVendor('light/get_aa_state_vars', {
					address: aa_addess
				}, (ws, request, response) => {

					//get auction data 
					var auctions = getData(response)

					//prepare message
					let message = prepareMyWonAuctionOverview(auctions, buyer_address)

					//send response
					device.sendMessageToDevice(from_address, 'text', message);

					steps[from_address] = 'mainMenu';
				})
			}, 1000)
		}

		//state machine: sell steps
		else if (step === 'sell_description') {
			tempData[from_address] = { "seller": "true" }
			tempData[from_address]['product_description'] = text;

			device.sendMessageToDevice(from_address, 'text', message_SellStartPrice);
			steps[from_address] = 'sell_startprice';
		}

		else if (step === 'sell_startprice') {
			tempData[from_address]['start_price'] = text;

			device.sendMessageToDevice(from_address, 'text', message_SellLowestPrice);
			steps[from_address] = 'sell_lowestprice';
		}

		else if (step === 'sell_lowestprice') {
			tempData[from_address]['lowest_price'] = text;

			device.sendMessageToDevice(from_address, 'text', message_SellPriceSteps);
			steps[from_address] = 'sell_pricesteps';
		}

		else if (step === 'sell_pricesteps') {
			tempData[from_address]['price_steps'] = text;

			device.sendMessageToDevice(from_address, 'text', message_SellTimeSteps);
			steps[from_address] = 'sell_timesteps';
		}

		else if (step === 'sell_timesteps') {
			tempData[from_address]['time_steps'] = text;

			device.sendMessageToDevice(from_address, 'text', message_SellEncryptAlgo);
			steps[from_address] = 'sell_encryption_algo';
		}

		else if (step === 'sell_encryption_algo') {
			tempData[from_address]['encryptionAlgorithm'] = text;

			device.sendMessageToDevice(from_address, 'text', message_SellPublicKey);
			steps[from_address] = 'sell_startAuction';
		}

		else if (step === 'sell_startAuction') {
			var public_key
			var message = ""

			if (text == "generate_keypair"){
				const { publicKey, privateKey } = generateKeys();

				public_key = publicKey

				message += message_SellKeyPublicKey
				message += publicKey
				message += "\n"
				message += message_SellKeyPrivateKey
				message += privateKey
				message += "\n\n"
			}
			else public_key = text

			//test pub key
			var public_key_ok = true
		    try {
				encryptText("foo", public_key)
			} catch (error) {
				public_key_ok = false
			}

			if (public_key_ok){
				//split public into mx. 16 parts
				const noPublicKeyParts = 16;
				const maxDataLength = 64;
				for (let index = 0; index < noPublicKeyParts; index++) {
					const pubkeySlice = public_key.slice(index*maxDataLength, index*maxDataLength + maxDataLength);
					if (pubkeySlice == "") break
					tempData[from_address]['public_key_'+index] = pubkeySlice		
				}			

				let base64data = Buffer.from(JSON.stringify(tempData[from_address])).toString('base64');
				let encodedbase64data = encodeURIComponent(base64data);

				//start auction
				message += message_SellStartAuction + aa_addess + "?amount=11000&base64data=" + encodedbase64data + ")"
				message += message_mainMenuDoSomethingElsePrefix + message_mainMenuText
				
				steps[from_address] = 'mainMenu';
			}
			else message = message_SellKeyNotAValidKey

			device.sendMessageToDevice(from_address, 'text', message);
		}
	});

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

function prepareAuctionOverview(auctions, pairing_code) {
	var message;
	message = message_BuyOverview
	var counter_running_auctions = 0

	for (let k of Object.keys(auctions)) {

		//do not show finished auctions
		var auction_status = auctions[k]['auction_status']
		if (auction_status != 'running' || (counter_running_auctions + 1) > maxNumAuctionsToShow) continue

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

		//merge public_key  slices
		const parts = 16;
		var public_key = "";
		for (let index = 0; index < parts; index++) {
			const key = 'public_key_'+index;
			if (auctions[k][key]){
				var slice = auctions[k][key].valueOf();
				public_key = public_key + slice	
			}
			else break;
		}
	
		//create buy link
		var link_data = {
			"buyer": "1",
			"reference": k
		}
		var buylink = ""
		try {
			//encrypt pairing code
			var encr_pairing_code = encryptText(pairing_code, public_key)

			//split encr_pairing_code into mx. 16 parts and add it to the link
			const maxDataLength = 64;
			for (let index = 0; index < parts; index++) {
				const slice = encr_pairing_code.slice(index*maxDataLength, index*maxDataLength + maxDataLength);
				if (slice == "") break
				link_data['pairing_code_'+index] = slice		
			}

			let base64data = Buffer.from(JSON.stringify(link_data)).toString('base64');
			let encodedbase64data = encodeURIComponent(base64data);
			buylink = message_BuyBidForProductPrefix + aa_addess + "?amount=" + current_price + "&base64data=" + encodedbase64data + ")"
		}
		catch(err) {
			buylink = "Problem with the seller's public key, bidding not possible."
		}		

		message += `
	** ${auctions[k]['product_description']} **
	 o Current price: ${current_price}
	 o Time steps: ${time_steps}
	 o Price steps: ${price_steps} 	 
	 o ${buylink}
`	
	}

	if (counter_running_auctions == 0) message = message + "-\n"

	message += message_mainMenuDoSomethingElsePrefix + message_mainMenuText

	return message;
}

function prepareAuctionOverviewAsSeller(auctions, sellerID, private_key) {
	var message;
	message = message_PairingOverviewFinishedAuctionsForSeller

	var my_auctions = 0

	for (let k of Object.keys(auctions)) {

		//only  auctions with status "buyer_data_confirm"	
		var auction_status = auctions[k]['auction_status']
		if (auction_status != 'holding') continue

		//only auction from where the user is seller
		var seller = auctions[k]['seller'].valueOf();
		if (sellerID.toUpperCase().trim() != seller.toUpperCase().trim()) continue

		my_auctions += 1

		// get interested data
		var product_description = auctions[k]['product_description'].valueOf();
		var buyer = auctions[k]['buyer'].valueOf();

		//merge pairing code slices
		const noPairingCodeParts = 16;
		var pairing_code = "";
		for (let index = 0; index < noPairingCodeParts; index++) {
			const key = 'pairing_code_'+index;
			if (key in auctions[k]){
				var slice = auctions[k][key]
				pairing_code = pairing_code + slice.valueOf();	
			}
			else break;
		}

		//decrypt if required
		if (private_key != "do_not_decrypt"){
			try {
				var decr_pairing_code = decryptText(pairing_code, private_key)
				message += `
	** ${product_description} **
	o Sold to: ${buyer}
	o Decrypted Pairing Code: ${decr_pairing_code}
				` 				
			} catch (error) {
				message += `
	** ${product_description} **
	o Sold to: ${buyer}
	o Encrypted Pairing Code (could not be decrypted):
	${pairing_code}
	` 
			}			
		}

		else{

		message += `
	** ${product_description} **
	 o Sold to: ${buyer}
	 o Encrypted pairing Code: ${pairing_code}
	` 
		}
	}

	if (my_auctions == 0) message = message + "-\n\n"

	message += message_PairingGetInContact

	message += message_mainMenuDoSomethingElsePrefix + message_mainMenuText

	return message;
}


function prepareMyConfirmedAuctionOverview(auctions, buyerID) {
	var message;
	message = message_BuyYouCanVoteForTheFollowinAuctions

	var my_auctions = 0

	for (let k of Object.keys(auctions)) {

		//only  auctions with status "buyer_data_confirm"	
		var auction_status = auctions[k]['auction_status']
		if (auction_status != 'buyer_data_confirm') continue

		//only auction from where the user is buyer
		var buyer = auctions[k]['buyer'].valueOf();
		if (buyerID.toUpperCase().trim() != buyer.toUpperCase().trim()) continue

		my_auctions += 1

		// get interested data
		var product_description = auctions[k]['product_description'].valueOf();
		var timestamp = auctions[k]['timestamp'].valueOf();
		var time = new Date(timestamp * 1000).toISOString();
		var seller = auctions[k]['seller'].valueOf();
		let confirmLink = `[Rate seller for this auction](command:${k})`

		message += `
	** ${product_description} **
	 o Bought from seller: ${seller}
	 o Auction finished time: ${time}
	 o ${confirmLink}
	` 
	}

	if (my_auctions == 0) message = message + "-\n\n"

	message += message_mainMenuDoSomethingElsePrefix + message_mainMenuText

	return message;
}


function prepareMyWonAuctionOverview(auctions, buyerID) {
	var message;
	message = message_BuyYouWonTheFollowinAuctions

	var my_auctions = 0

	for (let k of Object.keys(auctions)) {

		//only  auctions with status "holding"	
		var auction_status = auctions[k]['auction_status']
		if (auction_status != 'holding') continue

		//only auction from where the user is buyer
		var buyer = auctions[k]['buyer'].valueOf();
		if (buyerID.toUpperCase().trim() != buyer.toUpperCase().trim()) continue

		my_auctions += 1

		// get interested data
		var product_description = auctions[k]['product_description'].valueOf();
		var timestamp = auctions[k]['timestamp'].valueOf();
		var time = new Date(timestamp * 1000).toISOString();
		var seller = auctions[k]['seller'].valueOf();

		// create confirm link
		var link_data = {
			"buyer_data_confirm": "1",
			"reference": k
		}

		let base64data = Buffer.from(JSON.stringify(link_data)).toString('base64');
		let encodedbase64data = encodeURIComponent(base64data);
		let confirmLink = "Confirm data sent: [confirm](byteball:" + aa_addess + "?amount=10000" + "&base64data=" + encodedbase64data + ")"

		message += `
	** ${product_description} **
	 o Bought from seller: ${seller}
	 o Auction finished time: ${time}
	 o ${confirmLink}
	` 
	}

	if (my_auctions == 0) message = message + "-\n\n"

	message += message_mainMenuDoSomethingElsePrefix + message_mainMenuText

	return message;
}

function generateKeys() {
    return generateKeyPairSync('rsa', 
    {
            modulusLength: 1024,
            namedCurve: 'secp256k1', 
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem'     
            },     
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
              //  cipher: 'aes-256-cbc',
               // passphrase: "geheim"
            } 
    });
}



function encryptText(toEncrypt, publicKey) {
    const t = Buffer.from(toEncrypt, 'utf8')
    const encrypted = crypto.publicEncrypt(    {
        key: publicKey,
        paddig: constants.RSA_NO_PADDING 
	}, t);
    return encrypted.toString('base64')
}
  
function decryptText(toDecrypt, privateKey) {
    const buffer = Buffer.from(toDecrypt, 'base64')
    const decrypted = crypto.privateDecrypt(
      {
        key: privateKey.toString(),   
      },
      buffer,
    )
    return decrypted.toString('utf8')
}
