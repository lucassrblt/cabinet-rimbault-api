import { Resend } from 'resend'

let _resend: Resend | null = null

function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY || '')
  }
  return _resend
}

export const resend = new Proxy({} as Resend, {
  get(_target, prop, receiver) {
    const client = getResend()
    const value = Reflect.get(client, prop, receiver)
    return value
  },
})
