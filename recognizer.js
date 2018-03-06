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
const Doc = require('./doc');
const Title = require('./title');
const Abstract = require('./abstract');
const Extract = require('./extract');
const Metadata = require('./metadata');
const Page = require('./page');
const Jstor = require('./jstor');
const Db = require('./db');

const Recognizer = function () {
	
};

module.exports = Recognizer;

Recognizer.prototype.init = async function () {
	this.db = new Db();
	await this.db.init();
	
	this.doc = new Doc();
	this.title = new Title({db: this.db});
	this.extract = new Extract({db: this.db});
	this.metadata = new Metadata({db: this.db});
	this.abstract = new Abstract();
	this.page = new Page();
	this.jstor = new Jstor();
};

Recognizer.prototype.recognize = async function (json) {
	// Process received json to doc
	let doc = this.doc.getDoc(json);
	if (!doc) throw new Error('Invalid doc');
	
	let res;
	
	res = this.jstor.extract(doc.pages[0]);
	if (res) return res;
	
	let result = {};
	
	result = await this.metadata.extract(doc);
	
	result.authors = [];
	
	let doi = await this.extract.doi(doc.text);
	if (doi) result.doi = doi;
	
	res = this.extract.isbn(doc.text);
	if (res) result.isbn = res;
	
	res = this.extract.arxiv(doc.text);
	if (res) result.arxiv = res;
	
	res = this.extract.issn(doc.text);
	if (res) result.issn = res;
	
	let text = this.page.extract_header_footer(doc);
	
	res = await this.extract.journal(text);
	if (res) result.container = res;
	
	res = this.extract.volume(text);
	if (res) result.volume = res;
	
	res = this.extract.year(text);
	if (res) result.year = res;
	
	res = this.extract.issue(text);
	if (res) result.issue = res;
	
	result.type = 'journal-article';
	
	let pageInfo = this.page.getInfo(doc);
	result.pages = pageInfo.pages;
	
	res = await this.title.getTitleAuthor(doc.pages[pageInfo.firstPage]);
	if (res) {
		result.title = res.title;
		result.authors = res.authors;
	}
	else if (pageInfo.firstPage === 0 && doc.pages.length >= 2) {
		res = await this.title.getTitleAuthor(doc.pages[1]);
		if (res) {
			result.title = res.title;
			result.authors = res.authors;
		}
	}
	
	if (!result.doi) {
		let doi = await this.title.getDoi(doc);
		if (doi) result.doi = doi;
	}
	
	res = this.abstract.extract(doc);
	if (res) result.abstract = res;
	
	return result;
};