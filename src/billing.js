export const PLANS = {
  growth: { name: "Refund Recovery Growth", amount: 79, interval: "EVERY_30_DAYS" },
  pro: { name: "Refund Recovery Pro", amount: 149, interval: "EVERY_30_DAYS" }
};

export function subscriptionMutation(plan, returnUrl) {
  const selected = PLANS[plan];
  if (!selected) throw new Error("Unknown plan");
  return {
    query: `#graphql
      mutation CreateSubscription($name:String!,$returnUrl:URL!,$lineItems:[AppSubscriptionLineItemInput!]!) {
        appSubscriptionCreate(name:$name,returnUrl:$returnUrl,lineItems:$lineItems,test:false) {
          confirmationUrl userErrors { field message }
        }
      }`,
    variables: {
      name:selected.name, returnUrl,
      lineItems:[{plan:{appRecurringPricingDetails:{price:{amount:selected.amount,currencyCode:"USD"},interval:selected.interval}}}]
    }
  };
}
