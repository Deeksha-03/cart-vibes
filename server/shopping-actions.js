function isReferential(message) {
  return /\b(?:it|this|that|one|them|these|those|recommended|top)\b/.test(message) ||
    /ಅದನ್ನು|ಇದನ್ನು|ಅದನ್ನೇ|ಇದನ್ನೇ|ಅದರ|ಇದರ|ಅವುಗಳನ್ನು/.test(message);
}

function referencedIndex(message) {
  if (/\b(?:third|3rd)\b/.test(message)) return 2;
  if (/\b(?:second|2nd)\b/.test(message)) return 1;
  return 0;
}

export function resolveShoppingAction({ message, matches, suggestedProducts, cartItems }) {
  const lower = String(message).toLowerCase();
  const addIntent = /\b(?:add|put|include)\b/.test(lower) ||
    /ಸೇರಿಸು|ಸೇರಿಸಿ|ಕಾರ್ಟ್‌ಗೆ ಹಾಕು/.test(lower);
  const orderIntent = /\b(?:checkout|buy|purchase|order)\b|\bplace\s+(?:a |an )?order\b|\bconfirm\s+(?:my |the )?order\b/.test(lower) ||
    /ಖರೀದಿ|ಆರ್ಡರ್/.test(lower);

  if (!addIntent && !orderIntent) return null;

  const referential = isReferential(lower);
  const namedMatch = matches.find(product =>
    product.name?.toLowerCase().split(/\s+/).some(word => word.length > 3 && lower.includes(word))
  );
  const explicitMatch = namedMatch || (!referential && matches.length === 1 ? matches[0] : null);
  const suggestion = referential
    ? suggestedProducts[referencedIndex(lower)]
    : null;
  const product = explicitMatch || suggestion;

  if (addIntent) {
    return {
      intent: 'add',
      action: product ? { type: 'add_to_cart', productId: product.id, quantity: 1 } : null
    };
  }

  if (product) {
    return { intent: 'order', action: { type: 'place_order', productId: product.id, quantity: 1 } };
  }
  if (cartItems.length) return { intent: 'order', action: { type: 'checkout' } };
  return { intent: 'order', action: null };
}
