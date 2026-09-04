import assert from 'node:assert';
import test from 'node:test';
import { validateContact, validateContactField } from './contactValidation';

const ok = (f: Parameters<typeof validateContactField>[0], v: string) => validateContactField(f, v) === null;

test('the phone typo that started this is rejected', () => {
  // "m9059225891" reached the PDF. Every formatter passed it through, because
  // a formatter cannot tell a mistake from a convention it does not know.
  assert.ok(!ok('phone', 'm9059225891'));
  assert.ok(ok('phone', '9059225891'));
  assert.ok(ok('phone', '905-922-5891'));
  assert.ok(ok('phone', '(905) 922-5891'));
});

test('phone numbers from anywhere are accepted', () => {
  assert.ok(ok('phone', '+44 20 7946 0958'), 'UK');
  assert.ok(ok('phone', '+234 803 123 4567'), 'Nigeria');
  assert.ok(ok('phone', '+91 98765 43210'), 'India');
});

test('a phone that is obviously not one is rejected', () => {
  assert.ok(!ok('phone', '12345'), 'too short');
  assert.ok(!ok('phone', '1234567890123456789'), 'too long');
  assert.ok(!ok('phone', ''), 'required');
});

test('email checks the shape and nothing more', () => {
  assert.ok(ok('email', 'chukwudi.can@gmail.com'));
  assert.ok(ok('email', 'a+tag@sub.domain.co.uk'));
  assert.ok(!ok('email', 'chukwudi.can'));
  assert.ok(!ok('email', 'chukwudi@gmail'), 'no dot after the @');
  assert.ok(!ok('email', 'two @ signs@x.com'));
  assert.ok(!ok('email', ''));
});

test('a name is required and nothing else', () => {
  assert.ok(ok('name', 'Chukwudi Ndubuisi'));
  assert.ok(ok('name', "O'Brien-Smith"), 'punctuation in names is normal');
  assert.ok(ok('name', '李雷'), 'not every name is latin');
  assert.ok(!ok('name', '   '));
});

test('a linkedin field must hold a linkedin address', () => {
  assert.ok(ok('linkedin', 'linkedin.com/in/chukwudi-ndubuisi'));
  assert.ok(ok('linkedin', 'https://www.linkedin.com/in/someone/'));
  assert.ok(!ok('linkedin', 'Chukwudi Ndubuisi'), 'a name is the common mistake here');
  assert.ok(!ok('linkedin', 'github.com/someone'), 'wrong site');
  assert.ok(ok('linkedin', ''), 'optional');
});

test('a github field must hold a github address', () => {
  assert.ok(ok('github', 'github.com/chukwudican-sudo'));
  assert.ok(ok('github', 'https://github.com/someone'));
  assert.ok(!ok('github', 'chukwudican-sudo'), 'a username is not an address');
  assert.ok(ok('github', ''));
});

test('a website just has to look like one', () => {
  assert.ok(ok('website', 'meetalexius.com'));
  assert.ok(ok('website', 'https://meetalexius.com/work'));
  assert.ok(!ok('website', 'meetalexius'));
  assert.ok(ok('website', ''));
});

test('location is never rejected, because every answer people give is real', () => {
  for (const value of ['Toronto', 'Toronto, ON', 'Greater Toronto Area', 'Remote', '']) {
    assert.ok(ok('location', value), value);
  }
});

test('a complete form has nothing to report', () => {
  assert.deepEqual(
    validateContact({
      name: 'Chukwudi Ndubuisi',
      email: 'chukwudi.can@gmail.com',
      phone: '905-922-5891',
      location: 'Oshawa, ON',
      linkedin: 'linkedin.com/in/chukwudi-ndubuisi',
      github: 'github.com/chukwudican-sudo',
      website: 'meetalexius.com',
    }),
    {},
  );
});

test('an empty form reports only what is required', () => {
  const problems = validateContact({
    name: '', email: '', phone: '', location: '', linkedin: '', github: '', website: '',
  });
  assert.deepEqual(Object.keys(problems).sort(), ['email', 'name', 'phone']);
});
