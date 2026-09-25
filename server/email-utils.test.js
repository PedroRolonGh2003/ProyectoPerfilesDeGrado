import test from 'node:test'
import assert from 'node:assert/strict'
import { isInstitutionalEmail } from './email-utils.js'

test('valida correos institucionales de est.univalle.edu', () => {
  assert.equal(isInstitutionalEmail('usuario@est.univalle.edu'), true)
  assert.equal(isInstitutionalEmail('usuario@univalle.edu'), false)
  assert.equal(isInstitutionalEmail('usuario@gmail.com'), false)
})
