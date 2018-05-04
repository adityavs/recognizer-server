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

const utils = require('./utils');

const Metadata = function (options) {
	this.db = options.db;
	this.authors = options.authors;
};

module.exports = Metadata;

/**
 * Extract metadata from the actual PDF file metadata
 * @param doc
 * @return {Promise<void>}
 */
Metadata.prototype.extract = async function (doc) {
	let result = {};
	let normText = utils.normalize(doc.text);
	for (let key in doc.metadata) {
		if (key.toLowerCase() === 'title') {
			let normTitle = utils.normalize(doc.metadata[key]);
			if (normTitle.length < 15) continue;
			
			if (normText.indexOf(normTitle) >= 0) {
				result.title = doc.metadata[key].trim();
			}
			
			let doi = await this.db.getDoiByTitle(normTitle, normText, true);
			if (doi) {
				result.title = doc.metadata[key].trim();
				result.doi = doi;
			}
		}
		
		if (['doi', 'wps-articledoi'].includes(key.toLowerCase())) {
			let doi = doc.metadata[key];
			if (/10.\d{4,9}\/[^\s]*[^\s\.,]/.test(doi)) {
				result.doi = doi;
			}
		}
		
		if (key.toLowerCase().indexOf('author') === 0) { // author / authors
			let authors = doc.metadata[key];
			// Extract authors when names are in typical order: John P. Smith
			let res = await this.authors.extractFromStringType1(authors);
			if (res) {
				result.authors = res;
			}
			else {
				// Extract authors when the last name goes first: Smith, John
				res = await this.authors.extractFromStringType2(authors);
				if (res) {
					result.authors = res;
				}
			}
		}
		
		if (['isbn'].includes(key.toLowerCase())) {
			let isbn = doc.metadata[key];
			isbn = isbn.replace(/[^0-9X]/gi, '');
			if (isbn.length === 10 || isbn.length === 13) {
				result.isbn = isbn;
			}
		}
	}
	return result;
};
