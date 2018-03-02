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

const XRegExp = require('xregexp');

const Extract = function (options) {
	this.db = options.db;
};

module.exports = Extract;

Extract.prototype.isbn = function (text) {
	let rx = /(SBN|sbn)[ \u2014\u2013\u2012-]?(10|13)?[: ]*([0-9X][0-9X \u2014\u2013\u2012-]+)/g;
	
	let m;
	while (m = rx.exec(text)) {
		let str = m[3];
		let isbn = '';
		for (let c of str) {
			if (/[0-9X]/.test(c)) {
				isbn += c;
				if (isbn.length > 13) break;
			}
		}
		
		if (isbn.length === 10 || isbn.length === 13) {
			return isbn;
		}
	}
	
	return null;
};

Extract.prototype.arxiv = function (text) {
	let m = /arXiv:([a-zA-Z0-9\.\/]+)/g.exec(text);
	
	if (m) return m[1];
	return null;
};

Extract.prototype.issn = function (text) {
	let m = /ISSN:? *(\d{4}[-]\d{3}[\dX])/g.exec(text);
	
	if (m) return m[1];
	return null;
};

Extract.prototype.year = function (text) {
	let rx = /(^|\(|\s|,)([0-9]{4})(\)|,|\s|$)/g;
	
	let m;
	if (m = rx.exec(text)) {
		let year = m[2];
		
		year = parseInt(year);
		
		if (year >= 1800 && year <= 2030) {
			return year.toString();
		}
	}
	
	return null;
};

Extract.prototype.volume = function (text) {
	let m = /\b(?:volume|vol|v)\.?[\s:-]\s*(\d+)/i.exec(text);
	if (m) {
		let vol = m[1];
		if (vol.length <= 4) return vol;
	}
	return null;
};

Extract.prototype.issue = function (text) {
	let m = /\b(?:issue|num|no|number|n)\.?[\s:-]\s*(\d+)/i.exec(text);
	if (m) {
		let no = m[1];
		if (no.length <= 4) return no;
	}
	return null;
};

Extract.prototype.doi = async function (text) {
	let m = text.match(/10.\d{4,9}\/[-._;()\[\]\+<>\/:A-Za-z0-9]+/g);
	
	if (!m) return 0;
	
	let doi1 = '';
	let doi2 = '';
	
	for (let doi of m) {
		
		let cs = [];
		for (let c of doi) {
			if (c >= 'A' && c <= 'Z') c = c.toLowerCase();
			cs.push(c);
		}
		doi1 = cs.join('');
		
		doi2 = doi1;
		
		let ret = 0;
		
		if (doi2.length < 64) {
			do {
				
				if (await this.db.doiExists(doi2)) {
					ret = 1;
					break;
				}
				doi2 = doi2.slice(0, doi2.length - 1);
			}
			while (doi2.length > 10);
			
			if (ret) break;
		}
	}
	
	if (doi2.length > 10) {
		return doi2;
	}
	else {
		return doi1;
	}
};

Extract.prototype.journal = async function (text) {
	let rx = XRegExp('([\\p{Letter}\'\.]+ )*[\\p{Letter}\'\.]+');
	let m;
	let pos = 0;
	while (m = XRegExp.exec(text, rx, pos)) {
		pos = m.index + m[0].length;
		let name = m[0];
		let nameParts = name.split(' ');
		let namePartsNum = nameParts.length;
		if (namePartsNum < 2) continue;
		
		if (await this.db.journalExists(name)) {
			return name;
		}
	}
	return null;
};
