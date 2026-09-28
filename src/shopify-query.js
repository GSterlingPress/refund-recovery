export const LOSS_SCAN_QUERY = `#graphql
query RefundRecoveryScan($cursor: String) {
  orders(first: 50, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id name
      refunds {
        id
        refundLineItems(first: 100) {
          nodes {
            quantity restocked restockType
            subtotalSet { shopMoney { amount currencyCode } }
            lineItem { id name fulfillmentStatus }
          }
        }
      }
      returns(first: 25) {
        nodes {
          id status
          returnLineItems(first: 100) {
            nodes {
              ... on ReturnLineItem {
                id quantity processedQuantity refundedQuantity
                fulfillmentLineItem { lineItem { id name } }
              }
            }
          }
        }
      }
    }
  }
}`;

export function normalizeShopifyOrders(payload) {
  return (payload?.data?.orders?.nodes || []).map(order => ({
    id: order.id,
    name: order.name,
    refunds: (order.refunds || []).map(refund => ({
      id: refund.id,
      refundLineItems: (refund.refundLineItems?.nodes || []).map(x => ({
        lineItemId: x.lineItem?.id,
        title: x.lineItem?.name,
        fulfilled: x.lineItem?.fulfillmentStatus !== "UNFULFILLED",
        quantity: x.quantity,
        restocked: x.restocked,
        restockType: x.restockType,
        subtotal: x.subtotalSet?.shopMoney?.amount || "0"
      }))
    })),
    returns: (order.returns?.nodes || []).map(ret => ({
      id: ret.id,
      status: ret.status,
      lineItems: (ret.returnLineItems?.nodes || []).map(x => ({
        id: x.id,
        title: x.fulfillmentLineItem?.lineItem?.name,
        quantity: x.quantity,
        processedQuantity: x.processedQuantity,
        refundedQuantity: x.refundedQuantity
      }))
    }))
  }));
}
