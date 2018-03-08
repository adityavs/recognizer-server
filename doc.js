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

Doc.prototype.getDoc = function (json) {
	let doc = {text: '', pages: []};
	
	if (!json.totalPages) return null;
	
	doc.totalPages = json.totalPages;
	
	doc.metadata = json.metadata;
	
	if (!json.pages) return null;
	for (let p of json.pages) {
		let page = {
			width: p[0],
			height: p[1],
			fDist: {},
			fsDist: {},
			contentLeft: 9999999,
			contentRight: 0,
			text: '',
			flows: []
		};
		doc.pages.push(page);
		for (let f of p[2]) {
			let flow = {blocks: []};
			page.flows.push(flow);
			for (let b of f[0]) {
				let block = {xMin: b[0], yMin: b[1], xMax: b[2], yMax: b[3], text: '', lines: []};
				flow.blocks.push(block);
				for (let l of b[4]) {
					let line = {xMin: 0, yMin: 0, xMax: 0, yMax: 0, text: '', words: []};
					block.lines.push(line);
					doc.text += '\n';
					page.text += '\n';
					block.text += '\n';
					for (let w of l[0]) {
						let word = {
							xMin: w[0],
							yMin: w[1],
							xMax: w[2],
							yMax: w[3],
							fontsize: w[4],
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
						
						doc.text += word.text + (word.space ? ' ' : '');
						page.text += word.text + (word.space ? ' ' : '');
						block.text += word.text + (word.space ? ' ' : '');
						line.text += word.text + (word.space ? ' ' : '');
						
						if (!line.xMin || line.xMin > word.xMin) line.xMin = word.xMin;
						if (!line.yMin || line.yMin > word.yMin) line.yMin = word.yMin;
						if (line.xMax < word.xMax) line.xMax = word.xMax;
						if (line.yMax < word.yMax) line.yMax = word.yMax;
						
						if (page.contentLeft > word.xMin) page.contentLeft = word.xMin;
						if (page.contentRight < word.xMax) page.contentRight = word.xMax;
						
						if (page.fsDist[word.fontsize]) {
							page.fsDist[word.fontsize] += word.text.length;
						}
						else {
							page.fsDist[word.fontsize] = word.text.length;
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
