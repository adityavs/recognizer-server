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
};

module.exports = Metadata;

Metadata.prototype.extract = async function (doc) {
	let result = {};
	for (let key in doc.metadata) {
		if (key.toLowerCase() === 'title') {
			let normTitle = utils.normalize(doc.metadata[key]);
			let normText = utils.normalize(doc.text);
			if (normTitle >= 10 && normText.indexOf(normTitle) >= 0) {
				result.title = key;
			}
			
			let doi = await this.db.getDoiByTitle(normTitle, normText);
			if (doi) {
				result.title = doc.metadata[key];
				result.doi = doi;
			}
		}
		
		if (['key', 'wps-articledoi'].includes(key.toLowerCase())) {
			let doi = doc.metadata[key];
			if (/10.\d{4,9}\/[^\s]*[^\s\.,]/.test(doi)) {
				result.doi = doi;
			}
		}
	}
	return result;
};
