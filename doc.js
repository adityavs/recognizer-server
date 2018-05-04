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

const Lbs = require('./lbs');

const Doc = function () {
	this.lbs = new Lbs();
};

module.exports = Doc;

/**
 * The function processes a json produced by a modified pdftotext version (xpdf),
 * and creates a document that is used for further processing.
 * The json contains PDF metadata and structured page data,
 * which is kept in arrays to reduce request size.
 * Each page structure consists of: page->column->paragraph->line->word,
 * but we are only interested in lines and words.
 * Lines are grouped to blocks (paragraphs) on the server side (in lbs.js), because
 * pdftotext produced columns and paragraphs aren't good enough in our case.
 * It also reduces dependency on specific pdftotext version (xpdf, poppler), because
 * poppler instead of columns and paragraphs, has flows and blocks
 * @param json
 * @return {object}
 */
Doc.prototype.getDoc = function (json) {
	let doc = {text: '', pages: []};
	
	if (!json.totalPages) return null;
	
	doc.totalPages = json.totalPages;
	
	doc.metadata = json.metadata;
	
	if (!json.pages) return null;
	// PAGES
	for (let p of json.pages) {
		let page = {
			width: p[0],
			height: p[1],
			fDist: {},
			fsDist: {},
			contentLeft: 9999999,
			contentRight: 0,
			text: '',
			lines: []
		};
		doc.pages.push(page);
		// COLUMNS
		for (let f of p[2]) {
			// PARAGRAPHS
			for (let b of f[0]) {
				// LINES
				for (let l of b[4]) {
					let line = {xMin: 0, yMin: 0, xMax: 0, yMax: 0, text: '', words: []};
					page.lines.push(line);
					doc.text += '\n';
					page.text += '\n';
					// WORDS
					for (let w of l[0]) {
						let word = {
							xMin: w[0],
							yMin: w[1],
							xMax: w[2],
							yMax: w[3],
							fontSize: w[4],
							space: w[5],
							baseline: w[6],
							rotation: w[7],
							underlined: w[8],
							bold: w[9],
							italic: w[10],
							color: w[11],
							font: w[12],
							text: w[13]
						};
						line.words.push(word);
						
						word.text = this.clean(word.text);
						
						doc.text += word.text + (word.space ? ' ' : '');
						page.text += word.text + (word.space ? ' ' : '');
						line.text += word.text + (word.space ? ' ' : '');
						
						if (!line.xMin || line.xMin > word.xMin) line.xMin = word.xMin;
						if (!line.yMin || line.yMin > word.yMin) line.yMin = word.yMin;
						if (line.xMax < word.xMax) line.xMax = word.xMax;
						if (line.yMax < word.yMax) line.yMax = word.yMax;
						
						if (page.contentLeft > word.xMin) page.contentLeft = word.xMin;
						if (page.contentRight < word.xMax) page.contentRight = word.xMax;
						
						if (page.fsDist[word.fontSize]) {
							page.fsDist[word.fontSize] += word.text.length;
						}
						else {
							page.fsDist[word.fontSize] = word.text.length;
						}
						
						if (page.fDist[word.font]) {
							page.fDist[word.font] += word.text.length;
						}
						else {
							page.fDist[word.font] = word.text.length;
						}
						
					}
				}
			}
		}
		
		page.lbs = this.lbs.getLineBlocks(page);
	}
	
	return doc;
};

/**
 * Remove zero width spaces
 * @param text
 * @return {string}
 */
Doc.prototype.clean = function (text) {
	return text.replace(/\u200B/g, '');
};
