const fs = require('fs');
const request = require('request');
const jsonDiff = require('json-diff');
const config = require('config');

function query(data) {
	return new Promise(function (resolve, reject) {
		request({
			url: 'http://localhost:' + config.get('port') + '/recognize',
			method: 'POST',
			json: data,
		}, function (err, res) {
			if (err || res.statusCode !== 200) return reject(err);
			resolve(res.body);
		});
	});
}

async function main() {
	let ret = 0;
	let file;
	
	let dataPath = __dirname + '/pdftest-data/';
	if (!fs.existsSync(dataPath)) {
		console.log('pdftest-data does not exist');
		process.exit(1);
	}
	
	let files = fs.readdirSync(dataPath);
	files.sort();
	
	while (file = files.shift()) {
		if (file.slice(-7) !== 'in.json') continue;
		let id = file.slice(0, 3);
		console.log(id);
		
		let inPath = dataPath + id + '-in.json';
		let outPath = dataPath + id + '-out.json';
		
		let inJson = fs.readFileSync(inPath, 'utf8');
		inJson = JSON.parse(inJson);
		let res = await query(inJson);
		
		delete res.timeMs;
		
		let outJson = fs.readFileSync(outPath, 'utf8');
		outJson = JSON.parse(outJson);
		
		if (jsonDiff.diff(outJson, res)) {
			console.log(jsonDiff.diffString(outJson, res));
			ret = 1;
		}
	}
	process.exit(ret);
}

main();
