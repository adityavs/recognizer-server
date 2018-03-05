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

const sqlite = require('sqlite');
const XXHash = require('xxhash');
const Int64LE = require("int64-buffer").Int64LE;
const utils = require('./utils');

const Db = function () {

};

module.exports = Db;

Db.prototype.init = async function () {
	this.doidata = await sqlite.open('./db/doidata.sqlite', {Promise});
	this.word = await sqlite.open('./db/word.sqlite', {Promise});
	this.journal = await sqlite.open('./db/journal.sqlite', {Promise});
};

Db.prototype.doiExists = async function (doi) {
	let stmt = await this.doidata.prepare('SELECT * FROM doidata WHERE doi = ? LIMIT 1', [doi]);
	let row = await stmt.get();
	return !!row;
};

Db.prototype.journalExists = async function (journal) {
	journal = utils.normalize(journal);
	let hash = XXHash.hash64(new Buffer(journal), 0, 'buffer');
	hash = Int64LE(hash).toString();
	let stmt = await this.journal.prepare('SELECT 1 FROM journal WHERE hash = CAST(? AS INTEGER) LIMIT 1', [hash]);
	return !!await stmt.get();
};

Db.prototype.getWord = async function (word) {
	word = utils.normalize(word);
	let hash = XXHash.hash64(new Buffer(word), 0, 'buffer');
	hash = Int64LE(hash).toString();
	let stmt = await this.word.prepare('SELECT a, b, c FROM word WHERE hash = CAST(? AS INTEGER) LIMIT 1', [hash]);
	return await stmt.get();
};

Db.prototype.getDoiByTitle = async function (title, text) {
	let title_hash = XXHash.hash64(new Buffer(title), 0, 'buffer');
	title_hash = Int64LE(title_hash).toString();
	
	let stmt = await this.doidata.prepare('SELECT * FROM doidata WHERE title_hash = CAST(? AS INTEGER) LIMIT 6', [title_hash]);
	let row;
	while (row = await stmt.get()) {
		
		if (title.length >= 50) return row.doi;
		
		let author1Found = row.author1_len >= 4 && this.findAuthor(text, row.author1_hash, row.author1_len);
		let author2Found = row.author2_len >= 4 && this.findAuthor(text, row.author2_hash, row.author2_len);
		
		if (author1Found || author2Found) {
			return row.doi;
		}
	}
	return 0;
};

Db.prototype.findAuthor = function (text, authorHash, authorLen) {
	text = new Buffer(text);
	for (let i = 0; i < text.length - authorLen; i++) {
		let h = XXHash.hash(text.slice(i, i + authorLen),0);
		if (authorHash === h) {
			return true;
		}
	}
	return false;
};
