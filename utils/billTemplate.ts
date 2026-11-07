/**
 * Invoice HTML template for expo-print (HTML -> A4 PDF).
 * Edit BUSINESS below to set the real shop details in one place.
 */

import type { Invoice } from '../types';
import { amountInWords, formatDateTime, formatINR, formatQuantity } from './format';

/** Editable business details shown on every bill header. */
export const BUSINESS = {
  name: 'HERBECO',
  tagline: 'Pure & Natural Herbal Products',
  address: 'Kinfra, Chundale, Wayanad, PIN 673123',
  phone: '+91 75106 36708',
  gstin: '32FURPM3650J2Z7',
  email: 'herbecospices@gmail.com',
} as const;

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Prepare logo bytes for embedding: caller passes `data:image/png;base64,...`. */
export function buildInvoiceHtml(invoice: Invoice, logoDataUri: string | null): string {
  const rows = invoice.items
    .map(
      (item, i) => `
        <tr class="${i % 2 === 0 ? 'even' : 'odd'}">
          <td class="center">${i + 1}</td>
          <td>${esc(item.name)}<span class="unit-tag">${item.unit === 'kg' ? 'Sold by weight' : ' Sold by unit'}</span></td>
          <td class="center">${esc(formatQuantity(item.quantity, item.unit))}</td>
          <td class="right">${esc(formatINR(item.unitPrice))}</td>
          <td class="right strong">${esc(formatINR(item.unitPrice * item.quantity))}</td>
        </tr>`,
    )
    .join('');

  const discount = invoice.discount ?? 0;
  const discountRow =
    discount > 0
      ? `<div class="row muted"><span>Discount</span><span>− ${esc(
          formatINR(discount),
        )}</span></div>`
      : '';

  return `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: 'Helvetica', 'Arial', sans-serif;
    color: #1C2B24;
    font-size: 12px;
    padding: 24px;
    background: #FFFFFF;
  }
  .page { width: 100%; max-width: 760px; margin: 0 auto; }

  /* Brand band */
  .brand-band {
    background: #1F6F43;
    color: #FFFFFF;
    border-radius: 14px;
    padding: 20px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .brand-left { display: flex; align-items: center; }
  .logo-plate {
    background: #FFFFFF; border-radius: 12px; padding: 5px 8px;
    display: flex; align-items: center; justify-content: center;
  }
  .logo { height: 58px; width: auto; max-width: 190px; object-fit: contain; display: block; }
  .brand-name { font-size: 22px; font-weight: bold; letter-spacing: 2px; color: #FFFFFF; }
  .brand-tagline { font-size: 10px; color: #A8D5A2; margin-top: 2px; }
  .brand-right { text-align: right; font-size: 10px; line-height: 1.7; color: #E7F1E5; }

  /* Title row */
  .title-row { display: flex; align-items: center; justify-content: space-between; margin: 22px 4px 8px; }
  .title { font-size: 18px; font-weight: bold; letter-spacing: 3px; color: #1F6F43; }
  .meta { display: flex; justify-content: flex-end; margin: 4px 4px 14px; text-align: right; font-size: 11px; color: #6B7C74; }
  .meta b { color: #1C2B24; }

  /* Billed to */
  .billed {
    border: 1px solid #E4EDE6; border-left: 4px solid #A8D5A2; border-radius: 10px;
    padding: 12px 16px; margin: 0 4px 16px; background: #F7F9F5;
  }
  .billed .label { font-size: 9px; letter-spacing: 2px; color: #6B7C74; font-weight: bold; margin-bottom: 4px; }
  .billed .name { font-weight: bold; font-size: 13px; }
  .billed .phone { color: #6B7C74; font-size: 11px; margin-top: 1px; }

  /* Items table */
  table { width: 100%; border-collapse: collapse; margin: 0 4px; }
  th {
    background: #1F6F43; color: #FFFFFF; text-align: left; padding: 9px 10px;
    font-size: 10px; letter-spacing: 1px; text-transform: uppercase;
  }
  td { padding: 9px 10px; border-bottom: 1px solid #EDF3EE; }
  tr.even td { background: #F7F9F5; }
  tr.odd td { background: #FFFFFF; }
  .center { text-align: center; }
  .right { text-align: right; }
  .strong { font-weight: bold; }
  .unit-tag { color: #6B7C74; font-size: 9px; margin-left: 6px; }

  /* Totals */
  .totals { margin: 16px 4px 0; width: 45%; margin-left: auto; }
  .totals .row { display: flex; justify-content: space-between; padding: 7px 12px; font-size: 12px; }
  .totals .row.muted { color: #6B7C74; }
  .totals .grand {
    background: #C9A227; color: #FFFFFF; font-weight: bold; font-size: 14px;
    border-radius: 10px; margin-top: 6px; padding: 12px;
  }
  .words {
    margin: 14px 4px 0; padding: 10px 14px; background: #F7F9F5;
    border: 1px dashed #A8D5A2; border-radius: 10px; font-size: 11px;
  }
  .words b { color: #1F6F43; }

  /* Footer */
  .footer { margin-top: 40px; text-align: center; color: #6B7C74; font-size: 10px; line-height: 1.6; }
  .signature { margin: 26px 4px 0; text-align: right; }
  .signature .line { display: inline-block; width: 220px; border-top: 1px solid #1C2B24; padding-top: 6px; font-size: 11px; color: #6B7C74; }
  .thanks { color: #1F6F43; font-weight: bold; font-size: 13px; margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="page">
    <div class="brand-band">
      <div class="brand-left">
        ${
          logoDataUri
            ? `<div class="logo-plate"><img class="logo" src="${logoDataUri}" alt="${esc(BUSINESS.name)}" /></div>`
            : `<div>
                 <div class="brand-name">${esc(BUSINESS.name)}</div>
                 <div class="brand-tagline">${esc(BUSINESS.tagline)}</div>
               </div>`
        }
      </div>
      <div class="brand-right">
        ${esc(BUSINESS.address)}<br/>
        ${esc(BUSINESS.phone)}<br/>
        GSTIN: ${esc(BUSINESS.gstin)}
      </div>
    </div>

    <div class="title-row">
      <div class="title">TAX INVOICE</div>
    </div>
    <div class="meta">
      <div>
        Invoice No: <b>${esc(invoice.number)}</b><br/>
        Date: <b>${esc(formatDateTime(invoice.createdAt))}</b>
      </div>
    </div>

    <div class="billed">
      <div class="label">BILLED TO</div>
      <div class="name">${esc(invoice.customer.name)}</div>
      <div class="phone">+91 ${esc(invoice.customer.phone)}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:5%">S.No</th>
          <th>Item</th>
          <th style="width:14%">Qty</th>
          <th style="width:15%">Rate</th>
          <th style="width:18%">Amount</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>

    <div class="totals">
      <div class="row muted"><span>Item(s)</span><span>${invoice.items.length}</span></div>
      <div class="row muted"><span>Subtotal</span><span>${esc(formatINR(invoice.subtotal))}</span></div>
      ${discountRow}
      <div class="row muted"><span>GST (5%)</span><span>${esc(formatINR(invoice.gst))}</span></div>
      <div class="row grand"><span>Grand Total</span><span>${esc(formatINR(invoice.grandTotal))}</span></div>
    </div>

    <div class="words">
      Amount in words: <b>${esc(amountInWords(invoice.grandTotal))}</b>
    </div>

    <div class="signature">
      <div class="line">For ${esc(BUSINESS.name)}<br/><small>Authorised Signatory</small></div>
    </div>

    <div class="footer">
      <div class="thanks">Thank you for purchasing from HERBECO 🌿</div>
      <div>This is a computer generated invoice and does not require a physical stamp.</div>
    </div>
  </div>
</body>
</html>`;
}
