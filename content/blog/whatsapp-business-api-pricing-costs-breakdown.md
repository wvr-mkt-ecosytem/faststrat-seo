---
title: 'WhatsApp Business API Pricing: Costs Breakdown'
slug: whatsapp-business-api-pricing-costs-breakdown
excerpt: >-
  WhatsApp Business API costs two things: Meta's permessage fee (from $0.0034
  for a utility message in the US to $0.0625 for a marketing message reaching a
  n
keywords:
  - whatsapp business api pricing for small business
lang: en
category: SEO
status: draft
keywordTrend:
  direccion: baja
  cambioAnual: -70
  nivelActual: 9
---
WhatsApp Business API costs two things: Meta's per-message fee (from $0.0034 for a utility message in the US to $0.0625 for a marketing message reaching a number in Brazil), plus your BSP's markup, which runs $0.004–$0.005/message pay-as-you-go or €49/month flat.

**The short version if you need one number:** Meta's marketing rate is $0.0250 per delivered message to a US number and $0.0625 to a Brazilian one, per [SetSmart's 2026 rate table](https://setsmart.io/blog/whatsapp-business-api-pricing).

Run 1,000 marketing messages a month through those rates and the calculation gives $25 for a US list against $62.50 for a Brazilian one, before your BSP charges a cent. Audience geography drives the bill more than any other variable.

## How Meta's Per-Message Model Works

On July 1, 2025, Meta retired conversation-based billing and replaced it with per-message pricing. Every delivered template message now carries its own charge, determined by two variables: the message category and the recipient's country calling code, not your own location.

Four categories define every message:

- **Marketing:** promotions, product launches, cart reminders, special offers. The highest rate in every market.
- **Utility:** triggered by a user action: order confirmations, shipping updates, appointment reminders. Substantially cheaper than marketing.
- **Authentication:** one-time passwords (OTPs). Priced similarly to utility in most markets, though Mexico is an exception (more below).
- **Service:** replies to a customer who messaged you first, within the following 24 hours. **Free today; chargeable from October 1, 2026** (covered in the section below).

Utility and authentication messages qualify for volume-tier discounts as monthly volume grows, per [Meta's developer documentation](https://developers.facebook.com/docs/whatsapp/pricing/). Marketing messages have no volume discount at any tier.

Meta no longer prints per-country rates on that documentation page. It publishes downloadable rate cards and an interactive calculator instead, which is why every table below is sourced to a third party that transcribed a rate card, not to Meta directly. Pull your own rate card before you commit a budget.

## What Meta Charges Per Message

The table below uses rates transcribed from Meta's 2026 rate cards by [Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026), [SetSmart](https://setsmart.io/blog/whatsapp-business-api-pricing) and [EngageLab](https://www.engagelab.com/blog/whatsapp-business-api-pricing). US utility and authentication rates are confirmed via [Twilio's pricing page](https://www.twilio.com/en-us/whatsapp/pricing), which passes through Meta's fees transparently.

| Country | Marketing | Utility | Authentication |
|---|---|---|---|
| United States | $0.0250 | $0.0034 | $0.0034 |
| Brazil | $0.0625 | $0.0068 | $0.0068 |
| Mexico | $0.0305–$0.0436 † | $0.0080–$0.0085 † | $0.0085–$0.0207 † |
| United Kingdom | £0.0382 | £0.0159 | £0.0159 |
| Germany | €0.1131 | €0.0456 | €0.0456 |
| India | ₹0.7846 | ₹0.115 | ₹0.115 |

† Mexico is the one market where the transcriptions disagree, so the row shows both ends instead of picking a winner.

[EngageLab](https://www.engagelab.com/blog/whatsapp-business-api-pricing) publishes Mexico at $0.0305 marketing, with utility and authentication both at $0.0085 per message. It is also the source for the Brazil, UK, Germany and India rows above.

[SetSmart](https://setsmart.io/blog/whatsapp-business-api-pricing) publishes the same market at $0.0436 marketing, $0.0080 utility and $0.0207 authentication. Quarterly rate revisions and volume tiers plausibly explain the gap, but neither transcription can be checked against Meta's own page, so budget from a rate card you downloaded yourself rather than from either number.

Three things jump from this table:

1. **Germany's marketing rate** (€0.1131, per [Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026)) is roughly 4.5× the US rate. European market campaigns cost meaningfully more per message.

2. **Mexico authentication** at $0.0207 costs more than Mexico utility at $0.0080 on [SetSmart's](https://setsmart.io/blog/whatsapp-business-api-pricing) transcription, a gap worth checking against your own rate card if your OTP flow runs through the same API.

3. **US utility at $0.0034**, confirmed on [Twilio's pricing page](https://www.twilio.com/en-us/whatsapp/pricing), makes automated transactional messages (order confirmations, shipping updates) nearly negligible cost, less than a third of a cent per message.

## Three Free Windows That Cut Your Bill

Before comparing BSP options, know where Meta charges nothing. Most small businesses miss at least one of these.

**The 24-hour customer service window.** Every time a customer messages you first, a 24-hour window opens. Inside it, all non-template replies are free, and utility templates also cost nothing. A support agent can handle an entire case with as many messages as needed at zero Meta cost.

**The 72-hour click-to-WhatsApp window.** When a user clicks a Facebook or Instagram ad that opens a WhatsApp chat, all messages (including marketing templates) are free for 72 hours after that click. For small businesses running social ads, this entry point changes the math entirely: the conversation starts warm, the lead self-qualified by clicking, and Meta doesn't charge for three days of follow-up.

**OTPs inside open service windows.** Authentication templates sent during an active customer service window are also free. If you have a support → verify-account flow, sequencing the OTP inside the same window eliminates that charge.

A business that routes most outreach through click-to-WhatsApp ads can reduce its Meta fees to near zero for that audience segment.

## WhatsApp Business API Pricing for Small Business: BSP Costs

Meta doesn't offer direct API access to small businesses. You sign up through a Business Solution Provider, which adds its own cost on top of Meta's charges. Two pricing models dominate: per-message markup and monthly flat fee.

| BSP | Their fee | Meta markup | Best for |
|---|---|---|---|
| Twilio | $0.005/msg | Passed through | Low volume, pay-as-you-go |
| Telnyx | $0.004/msg | Passed through | Low volume, pay-as-you-go |
| 360dialog Regular | €49/month per number | No markup | Steady monthly volume |
| 360dialog Premium | €99/month per number | No markup | High volume + priority support |
| Wati | $49 / $99 / $299 per month | Passed through | Teams needing a built-in inbox |

Where each row comes from: Twilio publishes a message handling fee of $0.005 on [its WhatsApp pricing page](https://www.twilio.com/en-us/whatsapp/pricing), charged on inbound and outbound alike.

[Telnyx](https://telnyx.com/resources/whatsapp-business-api-cost) publishes $0.004 per message.

[360dialog](https://360dialog.com/pricing) lists WhatsApp API Regular and Premium as monthly per-number plans and states no markup on Meta fees, so your invoice shows Meta's rate passed through at cost plus the platform fee.

Wati's three plan tiers, topping out at $299 per month, come from [SetSmart's BSP comparison](https://setsmart.io/blog/whatsapp-business-api-pricing).

**The crossover math.** Twilio's per-message markup equals 360dialog's monthly plan fee at roughly 10,000 messages, a calculation of €49 ÷ $0.005 at near-parity exchange rates. Below that, per-message billing costs less because you're not paying for capacity you don't use. Above it, a flat-fee platform with no per-message markup wins.

## What a Small Business Actually Pays Per Month

These scenarios use published rates only, not modeled estimates.

**Scenario A (illustrative): US e-commerce store, 2,000 marketing + 1,500 utility messages/month, using Twilio:**

| Cost | Calculation | Amount |
|---|---|---|
| Meta marketing (2,000 msgs) | 2,000 × $0.0250 | $50.00 |
| Meta utility (1,500 msgs) | 1,500 × $0.0034 | $5.10 |
| Twilio markup (3,500 msgs) | 3,500 × $0.005 | $17.50 |
| **Monthly total** | | **$72.60** |

**Scenario B (illustrative): Same volume, same BSP, audience in Brazil:**

| Cost | Calculation | Amount |
|---|---|---|
| Meta marketing (2,000 msgs) | 2,000 × $0.0625 | $125.00 |
| Meta utility (1,500 msgs) | 1,500 × $0.0068 | $10.20 |
| Twilio markup (3,500 msgs) | 3,500 × $0.005 | $17.50 |
| **Monthly total** | | **$152.70** |

Same BSP, same message volume, same category split. Brazil geography raises the bill from $72.60 to $152.70, a 110% increase (calculated from the scenario figures above). The BSP choice didn't move it. The rate table did.

## October 1, 2026: Service Messages Become Chargeable

Today is August 12, 2026. In 50 days, **service messages stop being free.**

Starting October 1, Meta charges for every message sent inside a customer service window (the replies your agents send after a customer contacts you). Per-market service rates, per [Patagon AI's analysis](https://www.patagon.ai/blog-posts/whatsapp-business-api-pricing) of Meta's published rate cards:

- **Mexico:** $0.0085/message
- **Brazil:** $0.0068/message, per [Patagon AI](https://www.patagon.ai/blog-posts/whatsapp-business-api-pricing)
- **Colombia:** $0.0008/message

A support team handling 300 inbound conversations/month in Mexico, averaging 3 replies each, generates 900 service messages × $0.0085 = **$7.65/month** in new costs. Not a budget emergency on its own, but it's a real line item that didn't exist before, and it compounds with volume. Design your automated flows to resolve in fewer exchanges before October.

## FAQ

**Do I pay Meta and my BSP separately?**
Most BSPs (Twilio, Telnyx, 360dialog) pass Meta's fees through and add their own markup on top. The underlying structure is always two layers: Meta charges for the message category and country, your BSP charges for platform access. Some consolidate this into one invoice; others split it.

**Is there still a free monthly message or conversation allowance?**
No. The 1,000 free monthly conversations existed under conversation-based billing, which ended July 1, 2025, per [Blueticks](https://blueticks.co/blog/whatsapp-business-api-pricing-2026). What remains is the 24-hour free service window and the 72-hour free click-to-WhatsApp entry point, both free but triggered by user behavior rather than a monthly quota.

**Which BSP is cheapest for fewer than 5,000 messages/month?**
At that volume, per-message providers win. Telnyx at $0.004/msg (per [Telnyx's pricing page](https://telnyx.com/resources/whatsapp-business-api-cost)) adds $20 for 5,000 messages; 360dialog's minimum plan is €49/month regardless of volume. The per-message model beats flat-fee until you cross roughly 10,000 messages/month (at the rates above), at which point the math reverses.

**Does my country determine the rate, or my customer's country?**
Your customer's country calling code sets the rate. A US-based business messaging numbers in Brazil pays $0.0625 per marketing message (the Brazil rate), not the US rate of $0.0250.

---

**What to do this week:** Pull your last 30 days of outbound message volume and split it by category: marketing, utility, authentication, service. If your current platform doesn't break this out, that's the first thing to fix: you can't optimize what you can't see. Then run your marketing volume through the country rates in the table. That single calculation tells you whether geography is the main cost driver (it usually is) and whether your BSP model makes sense at your actual volume.

If you want message routing, template approvals, and WhatsApp Business API cost tracking handled automatically, without managing BSP contracts and developer documentation yourself, see how [FastStrat's WhatsApp automation agents](https://faststrat.ai/agents/whatsapp) work for small businesses.

---

You now know what to do. The hard part is doing it every week, without a marketing team, while you run the business.

That is the job FastStrat does: it plans the content, writes it, publishes it, and tells you what actually moved. One place, no stack to assemble.

**[Start free at app.faststrat.ai →](https://app.faststrat.ai)**

Set it up in minutes. Keep what works.
