export function scanRefundLosses(orders = []) {
  const findings = [];
  for (const order of orders) {
    for (const refund of order.refunds || []) {
      for (const item of refund.refundLineItems || []) {
        const amount = Number(item.subtotal || 0);
        const qty = Number(item.quantity || 0);
        if (qty <= 0 || amount <= 0) continue;
        if (item.restockType === "NO_RESTOCK" && item.fulfilled) {
          findings.push({severity:"high",type:"REFUNDED_NOT_RESTOCKED",orderId:order.id,orderName:order.name,refundId:refund.id,lineItemId:item.lineItemId,title:item.title,quantity:qty,amount,reason:"A fulfilled item was refunded with NO_RESTOCK. Verify whether merchandise was actually returned or inventory was intentionally written off."});
        }
        if (item.restockType === "RETURN" && item.restocked === false) {
          findings.push({severity:"high",type:"RETURN_NOT_RESTOCKED",orderId:order.id,orderName:order.name,refundId:refund.id,lineItemId:item.lineItemId,title:item.title,quantity:qty,amount,reason:"Refund says RETURN but Shopify reports the refund line item was not restocked."});
        }
      }
    }
    for (const ret of order.returns || []) {
      for (const item of ret.lineItems || []) {
        const processed = Number(item.processedQuantity || 0);
        const refunded = Number(item.refundedQuantity || 0);
        if (refunded > processed) findings.push({severity:"high",type:"REFUND_EXCEEDS_PROCESSED_RETURN",orderId:order.id,orderName:order.name,returnId:ret.id,title:item.title,quantity:refunded-processed,amount:null,reason:"Refunded return quantity exceeds processed return quantity."});
      }
    }
  }
  const knownAmount = findings.reduce((n,f)=>n+(f.amount||0),0);
  return {findingCount:findings.length,knownAmount:Number(knownAmount.toFixed(2)),findings};
}
