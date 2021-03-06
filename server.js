/*
 ***** BEGIN LICENSE BLOCK *****
 
 This file is part of the Zotero Data Server.
 
 Copyright © 2018 Center for History and New Media
 George Mason University, Fairfax, Virginia, USA
 http://zotero.org
 
 This program is free software: you can redistribute it and/or modify
 it under the terms of the GNU Affero General Public License as published by
 the Free Software Foundation, either version 3 of the License, or
 (at your option) any later version.
 
 This program is distributed in the hope that it will be useful,
 but WITHOUT ANY WARRANTY; without even the implied warranty of
 MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 GNU Affero General Public License for more details.
 
 You should have received a copy of the GNU Affero General Public License
 along with this program.  If not, see <http://www.gnu.org/licenses/>.
 
 ***** END LICENSE BLOCK *****
 */

const fs = require('fs');
const crypto = require('crypto');
const AWS = require('aws-sdk');
const moment = require('moment');
const Koa = require('koa');
const Router = require('koa-router');
const compress = require('koa-compress');
const config = require('config');
const bodyParser = require('koa-bodyparser');
const log = require('./log');
const statsD = require('./statsd');
const Recognizer = require('./recognizer');

const s3Client = new AWS.S3(config.get('s3'));
const recognizer = new Recognizer();


const app = new Koa();
app.proxy = true;

const router = new Router();

/**
 * A middleware to catch all errors
 */
app.use(async function (ctx, next) {
	let start = Date.now();
	
	try {
		await next()
	}
	catch (err) {
		ctx.status = err.status || 500;
		if (err.expose) {
			ctx.message = err.message;
		}
		
		// Be verbose only with internal server errors
		if (err.status) {
			log.warn(err.message);
		}
		else {
			log.error(err);
		}
	}
	
	let responseTime = Date.now() - start;
	
	log.info(
		'request: %s - - [%s] "%s %s %s/%s" %s %d "%s" "%s" %s/%s',
		ctx.ip,
		moment().format('D/MMM/YYYY:HH:mm:ss ZZ'),
		ctx.method.toUpperCase(),
		ctx.url,
		ctx.protocol.toUpperCase(),
		ctx.req.httpVersion,
		ctx.status,
		ctx.length || 0,
		ctx.headers['referer'] || '-',
		ctx.headers['user-agent'] || '-',
		ctx.recognitionTime || '-',
		responseTime
	);
	
	statsD.timing('response_time', responseTime);
});

app.use(bodyParser());

/**
 * A middleware to use gzip compression if the file is compressible
 * e.g. has text/html, text/css or similar 'text' content-type,
 * and is at least 2048 bytes size
 */
app.use(compress({
	filter: function (content_type) {
		return /text/i.test(content_type)
	},
	threshold: 2048,
	flush: require('zlib').Z_SYNC_FLUSH
}));

router.post('/recognize', async function (ctx) {
	let json = ctx.request.body;
	let t = Date.now();
	let res = await recognizer.recognize(json);
	if (!res) res = {};
	let recognitionTime = Date.now() - t;
	res.timeMs = recognitionTime;
	ctx.recognitionTime = recognitionTime;
	statsD.timing('recognition_time', recognitionTime);
	log.debug('request processed in %dms', recognitionTime);
	ctx.body = res;
	log.debug(res);
});

router.post('/report', async function (ctx) {
	let res = await s3Client.upload({
		Key: 'reports/' + (new Date().toISOString()) + '.json',
		Body: JSON.stringify(ctx.request.body, null, 2),
	}).promise();
	ctx.body = {};
});

router.get('/stats', async function (ctx) {
	ctx.body = {};
});

app
	.use(router.routes())
	.use(router.allowedMethods());


process.on('SIGTERM', function () {
	log.warn("Received SIGTERM");
	shutdown();
});

process.on('SIGINT', function () {
	log.warn("Received SIGINT");
	shutdown();
});

process.on('uncaughtException', function (err) {
	log.error("Uncaught exception:", err);
	shutdown();
});

process.on("unhandledRejection", function (reason, promise) {
	log.error('Unhandled Rejection at:', promise, 'reason:', reason);
	shutdown();
});

function shutdown() {
	log.info('Shutting down');
	//...
	log.info('Exiting');
	process.exit();
}

// Client connection errors
app.on('error', function (err, ctx) {
	log.debug('App error: ', err, ctx);
	log.info('client error: %s %s', ctx.ip, err.message);
});

module.exports = async function (callback) {
	
	await recognizer.init();
	
	log.info("Starting recognizer-server [pid: " + process.pid + "] on port " + config.get('port'));
	await new Promise(function (resolve, reject) {
		let server = app.listen(config.get('port'), function (err) {
			if (err) return reject(err);
			resolve();
		});
		// Set a timeout for disconnecting inactive clients
		server.setTimeout(config.get('connectionTimeout') * 1000);
	});
};
