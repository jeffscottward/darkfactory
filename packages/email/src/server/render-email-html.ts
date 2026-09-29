const XHTML_DOCTYPE =
  '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">'
const FONT_STACK =
  "Public Sans, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"

const escapeHtml = (value: string): string => value
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;")

export type TransactionalEmailHtmlInput = Readonly<{
  actionAriaLabel: string
  actionLabel: string
  actionUrl: string
  backgroundColor: string
  body: string
  containerColor: string
  expiry: string
  footer: string
  greeting: string
  heading: string
  title: string
}>

export const renderTransactionalEmailHtml = (
  input: TransactionalEmailHtmlInput,
): string => `${XHTML_DOCTYPE}<html dir="ltr" lang="en"><head><title>${escapeHtml(input.title)}</title></head><body dir="ltr" lang="en" style="background-color:${input.backgroundColor};color:#211f1b;font-family:${FONT_STACK};margin:0;padding:32px 12px"><div style="display:none">${escapeHtml(input.title)}</div><div style="background-color:${input.containerColor};border:1px solid #d6d0c4;border-radius:12px;box-sizing:border-box;margin:0 auto;max-width:600px;padding:40px"><main aria-labelledby="transactional-email-heading"><h1 id="transactional-email-heading" style="font-size:28px;line-height:1.2;margin:0 0 24px">${escapeHtml(input.heading)}</h1><p>${escapeHtml(input.greeting)}</p><p>${escapeHtml(input.body)}</p><a aria-label="${escapeHtml(input.actionAriaLabel)}" href="${escapeHtml(input.actionUrl)}" style="background-color:#211f1b;border-radius:6px;color:#fff;display:inline-block;font-weight:700;padding:14px 20px;text-decoration:none">${escapeHtml(input.actionLabel)}</a><p>${escapeHtml(input.expiry)}</p><p style="color:#615d55;font-size:14px">${escapeHtml(input.footer)}</p></main></div></body></html>`

export type ContactEmailHtmlInput = Readonly<{
  email: string
  message: string
  name: string
  subject: string
}>

export const renderContactEmailHtml = (
  input: ContactEmailHtmlInput,
): string => `${XHTML_DOCTYPE}<html dir="ltr" lang="en"><head><title>New DarkFactory contact request</title></head><body dir="ltr" lang="en" style="background-color:#f6f2ea;color:#211f1b;font-family:${FONT_STACK};margin:0;padding:32px 12px"><div style="display:none">New DarkFactory contact request</div><div style="background-color:#fbf9f4;border:1px solid #d6d0c4;border-radius:12px;box-sizing:border-box;margin:0 auto;max-width:600px;padding:40px"><main aria-labelledby="contact-email-heading"><h1 id="contact-email-heading">New contact request</h1><p style="font-size:13px;font-weight:700;text-transform:uppercase">From</p><p style="overflow-wrap:anywhere;white-space:pre-wrap">${escapeHtml(input.name)}</p><p style="overflow-wrap:anywhere">${escapeHtml(input.email)}</p><p style="font-size:13px;font-weight:700;text-transform:uppercase">Subject</p><p style="overflow-wrap:anywhere;white-space:pre-wrap">${escapeHtml(input.subject)}</p><p style="font-size:13px;font-weight:700;text-transform:uppercase">Message</p><p style="overflow-wrap:anywhere;white-space:pre-wrap">${escapeHtml(input.message)}</p></main></div></body></html>`
