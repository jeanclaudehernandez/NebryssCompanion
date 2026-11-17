/**
 * Experimental list format for the Colibri bridge (opt-in from the UI's "Experimental format"
 * checkbox): list_entities results as a table, one header row with the column names, then one
 * row of values per entry, instead of compact JSON that repeats every key in every entry.
 *
 * Measured with the served model's tokenizer on campaign data (2026-11-17): bestiary 9,868 ->
 * 7,538 tokens (-24%), weapon rules 2,312 -> 1,852 (-20%), players 1,655 -> 1,459 (-12%).
 * Single records (get_entity) stay JSON: the model reads them before staging update-*
 * commands, which need their exact structure.
 */

const BOOKKEEPING = /^(_id|__v|isDiscovered|discoveredCampaignIds|image|imageUrl|portrait|mapImage|createdAt|updatedAt)$/;

// A real HTML tag (a name of two or more letters, or b/i/p/q/s/u): rule text holds
// placeholders like "<x>" ("Penetrating <x>") that must stay.
const HTML_TAG = /<\/?(?:[a-z][a-z0-9-]+|[bipqsu])(?:\s[^<>]*)?\/?>/gi;

const isEmpty = (v) => v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0);
const isScalar = (v) => v === null || typeof v !== 'object';

/** Text of a scalar: no HTML, one line, and no "|" (the column separator). */
function scalarText(v) {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(HTML_TAG, '')
    .replace(/\s*\n\s*/g, ' / ')
    .replace(/\|/g, '/')
    .trim();
}

/**
 * A nested value on one line: a stats object as "Movement 6, Wounds 10, body universal; human",
 * an object within it in parentheses ("mistrals (digital 0, physical 60)"), named sub-entries
 * (abilities...) as "Name: effect", other lists joined with "; ".
 */
function inlineText(v) {
  if (isScalar(v)) return scalarText(v);
  if (Array.isArray(v)) {
    return v.map((x) => {
      if (isScalar(x)) return scalarText(x);
      if (x.name && (x.effect || x.description)) return `${scalarText(x.name)}: ${scalarText(x.effect || x.description)}`;
      return `(${inlineText(x)})`;
    }).join('; ');
  }
  // An object inside the cell's object goes in parentheses: "mistrals (digital 0, physical 60)",
  // not "mistrals digital 0, physical 60", where "physical" no longer read as part of mistrals.
  return Object.entries(v)
    .filter(([, x]) => !isEmpty(x))
    .map(([k, x]) => (x && typeof x === 'object' && !Array.isArray(x) ? `${k} (${inlineText(x)})` : `${k} ${inlineText(x)}`))
    .join(', ');
}

/** The entry without bookkeeping fields and empty values. */
function cleanEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return { value: entry };
  const out = {};
  for (const [k, v] of Object.entries(entry)) {
    if (!BOOKKEEPING.test(k) && !isEmpty(v)) out[k] = v;
  }
  return out;
}

/** Header (column names in order of first appearance) and one row per entry. */
function buildTable(entries) {
  const cleaned = entries.map(cleanEntry);
  const columns = [];
  for (const e of cleaned) for (const k of Object.keys(e)) if (!columns.includes(k)) columns.push(k);
  return {
    header: columns.join(' | '),
    rows: cleaned.map(e => columns.map(c => (e[c] === undefined ? '' : inlineText(e[c]))).join(' | '))
  };
}

// Attached reference sections, in the order they are dropped when the result is too long.
const RELATED = [
  ['_relatedWeapons', 'Weapons referenced'],
  ['_relatedAlteredStates', 'Altered states referenced'],
  ['_relatedWeaponRules', 'Weapon rules referenced']
];

/**
 * A list_entities result as text: a line saying which entries these are, the table, the
 * reference sections, and where to continue when the list did not fit.
 *
 * entries: the entries from `offset` on (already cut to the requested limit)
 * enrich:  async (entries) => object whose _related* arrays hold the rules/states/weapons the
 *          entries refer to (the bridge's enrichWithRulesAndStates)
 */
async function formatListAsTable({ type, entries, total, offset, budget, enrich, pagingNote }) {
  const { header, rows } = buildTable(entries);
  // Rows that fit, leaving a fifth of the budget for the reference sections.
  const fitted = [];
  let length = header.length + 200;
  for (const row of rows) {
    if (fitted.length > 0 && length + row.length + 1 > budget * 0.8) break;
    fitted.push(row);
    length += row.length + 1;
  }
  const end = offset + fitted.length;
  const enriched = (enrich && fitted.length > 0) ? (await enrich(entries.slice(0, fitted.length))) || {} : {};

  // The range first, worded as an instruction when the list is incomplete (pagingNote, from the
  // bridge): at the end of a long result the model answered from the first page alone.
  const range = pagingNote ? pagingNote(end) : `${type}: entries ${offset + 1}-${end} of ${total}.`;
  const head = `${range}\nTable: the first row names the columns, then one row per entry ("|" between columns).`;
  const more = end < total ? `(Incomplete: entries ${end + 1}-${total} need list_entities with offset=${end}.)` : '';
  const sections = RELATED
    .filter(([key]) => Array.isArray(enriched[key]) && enriched[key].length > 0)
    .map(([key, label]) => ({ key, text: `\n${label}:\n${enriched[key].join('\n')}` }));

  const compose = () => [head, header, ...fitted, ...sections.map(s => s.text), more].filter(Boolean).join('\n');
  let text = compose();
  const dropped = [];
  for (const [key, label] of RELATED) {
    if (text.length <= budget) break;
    const i = sections.findIndex(s => s.key === key);
    if (i < 0) continue;
    sections.splice(i, 1);
    dropped.push(label.toLowerCase());
    text = compose();
  }
  if (dropped.length) text += `\n(Omitted to fit: ${dropped.join(', ')}; fetch them with get_entity if needed.)`;
  return text;
}

module.exports = { formatListAsTable, buildTable, inlineText };
