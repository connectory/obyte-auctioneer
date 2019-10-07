var crypto = require("crypto");
var path = require("path");
var fs = require("fs");

const constants = require('ocore/constants.js');

text = "01234567890123456789012345678901234567890123456789"


for (let index = 0; index < 16; index++) {
    console.error(text.slice(index*3, index*3 + 3));		
}

/*
//TODO use give key, not dummy key
var absolutePath = path.resolve("./res/public.pem");
var publicKey = fs.readFileSync(absolutePath, "utf8");

var buffer = new Buffer(text);
var encrypted = crypto.publicEncrypt(    {
    key: publicKey,
    padding: constants.RSA_NO_PADDING 
}, buffer);


//return encrypted.toString("base64");
console.error("enc :"+ encrypted.toString("base64"))


//TODO encrypt with public key
//return ("dummy encrypted pairing code, encrypted with \""+public_key+"\"")

const constants = require('ocore/constants.js');
*/