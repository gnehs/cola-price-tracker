import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { executablePath } from 'puppeteer';
import fs from 'fs-extra';
import fetch from 'node-fetch';
import crypto from 'crypto';

function hash(str, salt = 'salt') {
  const hash = crypto.createHash('sha256')
  hash.update(str.toString() + salt, 'utf8')
  return hash.digest('hex').slice(0, 8)
}

(async () => {
  // Add stealth plugin and use defaults (all evasion techniques)
  puppeteer.use(StealthPlugin());

  const browser = await puppeteer.launch({
    executablePath: executablePath(),
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--lang=zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
    ],
  });
  const page = await browser.newPage();
  // expose log function
  await page.exposeFunction('log', (value) => console.log(value));
  // Set screen size
  await page.setViewport({ width: 1366, height: 768 });
  // get IP
  await page.goto('https://www.whatismyip.com.tw/', { waitUntil: 'networkidle2' });
  let ip = await page.evaluate(() => document.querySelector('[data-ip]').getAttribute('data-ip'))
  console.log(`IP: ${ip}`)
  // get UA
  await page.goto('https://www.whatismybrowser.com/detect/what-is-my-user-agent', { waitUntil: 'networkidle2' });
  let ua = await page.evaluate(() => document.querySelector('#detected_value').innerText)
  console.log(`UA: ${ua}`)
  async function scrollToBottom(page) {
    await page.evaluate(async () => {
      await new Promise((resolve, reject) => {
        let timer = setInterval(() => {
          let scrollHeight = document.body.scrollHeight;
          window.scrollBy(0, scrollHeight);
        }, 100);
        setTimeout(() => {
          let scrollHeight = document.body.scrollHeight;
          log(`🖱 ${scrollHeight}`)
          clearInterval(timer);
          resolve();
        }, 5000);
      });
    });
  }
  let result = []
  let keyword = '可口可樂'
  // get PChome result
  console.log(`🔍 search ${keyword} on PChome`)
  await page.goto(`https://ecshweb.pchome.com.tw/search/v3.3/?q=${encodeURIComponent(keyword)}&scope=all`, { waitUntil: 'networkidle2' });
  await scrollToBottom(page)
  let pchome = await page.evaluate(() => [...document.querySelectorAll('.col3f[id]')].map(x => {
    let name = x.querySelector('.prod_name').innerText
    let price = parseInt(x.querySelector('.price .value').innerText)
    let id = x.getAttribute('id')
    let href = `https://24h.pchome.com.tw/prod/${id}`
    try {
      let ml = parseInt(name.match(/(\d+)ml/)[1])
      let box = 1
      try {
        box = parseInt(name.match(/x?(\d+)(箱|組)?/)[1])
      } catch (e) { }
      let qty = parseInt(name.match(/(\d+)入/)[1])
      let totalQty = box * qty
      let pricePerMl = parseFloat((price / (ml * box * qty)).toFixed(4))
      return { source: "PChome", name, price, id, href, ml, box, qty, totalQty, pricePerMl }
    } catch (e) {
      return null
    }
  }))
  console.log(`🔍 PChome ${pchome.length} results`)
  result = result.concat(pchome)

  // get momo result
  console.log(`🔍 search ${keyword} on momo`)
  for (let i = 1; i < 3; i++) {
    await page.goto(`https://m.momoshop.com.tw/search.momo?searchKeyword=${encodeURIComponent(keyword)}&curPage=${i}`, { waitUntil: 'networkidle2' });
    let momo = await page.evaluate(() => [...document.querySelectorAll('.prdListArea .goodsItemLi')].map(x => {
      let name = x.querySelector('.prdName').innerText
      let price = parseInt(x.querySelector('.priceSymbol .price').innerText)
      let id = x.querySelector('#viewProdId').value
      let href = `https://www.momoshop.com.tw/goods/GoodsDetail.jsp?i_code=${id}`
      try {
        let ml = parseInt(name.match(/(\d+)ml/)[1])
        let box = 1
        try {
          box = parseInt(name.match(/(\d+)(箱|組)/)[1])
        } catch (e) { }
        let qty = parseInt(name.match(/(\d+)入/)[1])
        let totalQty = box * qty
        try {
          totalQty = parseInt(name.match(/共(\d+)入/)[1])
        } catch (e) { }
        let pricePerMl = parseFloat((price / (ml * totalQty)).toFixed(4))
        return { source: "momo", name, price, id, href, ml, box, qty, totalQty, pricePerMl }
      } catch (e) {
        return null
      }
    }))
    result = result.concat(momo)
    if (momo.length === 0) break
  }
  console.log(`🔍 momo ${result.length} results`)

  // build result
  result = result
    .filter(x => x)
    .filter(x => ['可口可樂'].some(y => x.name.includes(y)))
    .filter(x => !['Zero', 'zero', '纖維', '纖維+', '芬達', '雪碧', '無糖', '零卡', '+', '綠茶', 'Qoo'].some(y => x.name.includes(y)))
    .sort((a, b) => a.pricePerMl - b.pricePerMl)
  console.log(`🔍 ${result.length} results`)
  fs.copySync('./public', './dist')
  fs.mkdirSync('./dist/history', { recursive: true });
  fs.writeFileSync('./dist/result.json', JSON.stringify(result))

  let historyFileName = `${new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' }).split(' ')[0].replace(/\//g, '-')}.json`
  fs.writeFileSync(`./dist/history/${historyFileName}`, JSON.stringify(result))

  await browser.close();
})();