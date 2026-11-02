const { test, before } = require('node:test');
const assert = require('node:assert/strict');

let cleanWebUrl;
let caseForUrl;
let webCase;
before(async () => {
  ({ cleanWebUrl, caseForUrl, webCase } = await import('../web/src/lib/webDocument.js'));
});

test('only http and https URLs are accepted', () => {
  assert.equal(cleanWebUrl('  https://example.com/a  '), 'https://example.com/a');
  assert.equal(cleanWebUrl('javascript:alert(1)'), null);
  assert.equal(cleanWebUrl('example.com/a'), null);
  assert.equal(cleanWebUrl(''), null);
  assert.equal(cleanWebUrl(undefined), null);
});

test('a URL already in the set is found, whatever form it was stored in', () => {
  const found = { id: 1, document: { url: 'https://example.com/' } };
  const cases = [{ id: 2, document: { url: null } }, found];
  assert.equal(caseForUrl(cases, 'https://example.com'), found);
  assert.equal(caseForUrl(cases, 'https://example.com/other'), null);
});

test('comments on one page stay separate documents', () => {
  const cases = [{ id: 1, document: { url: 'https://github.com/a/b/issues/1#issuecomment-1' } }];
  assert.equal(caseForUrl(cases, 'https://github.com/a/b/issues/1#issuecomment-2'), null);
});

test('a web case is a blank golden case holding the pasted text', () => {
  const made = webCase({ url: 'https://www.example.com/post?id=7', title: ' A post ', text: '\n  We gave up on SSO.\n' });
  assert.equal(made.label_source, 'golden');
  assert.equal(made.name, 'web-example.com-A post');
  assert.equal(made.expected, undefined);
  assert.deepEqual(made.document, {
    source_system: 'web',
    external_id: 'https://www.example.com/post?id=7',
    url: 'https://www.example.com/post?id=7',
    title: 'A post',
    occurred_at: null,
    customer: null,
    firsthand: null,
    metadata: {},
    text: 'We gave up on SSO.',
  });
});

test('with no title, a web case is named from the URL', () => {
  const made = webCase({ url: 'https://news.ycombinator.com/item?id=45050270', title: '', text: 'x' });
  assert.equal(made.name, 'web-news.ycombinator.com-/item?id=45050270');
  assert.equal(made.document.title, null);
});
