const connection = document.querySelector('#connection');
const initialize = await chrome.runtime.sendMessage({ type: 'initialize' });
if (initialize.error) connection.textContent = initialize.error;

async function refresh() {
  const local = await chrome.storage.local.get(null);
  const receipts = Object.entries(local).filter(([key]) => key.startsWith('capture-')).map(([, value]) => value);
  document.querySelector('#receipts').replaceChildren(...receipts.map(receipt => {
    const article = document.createElement('article');
    const text = document.createElement('pre');
    text.textContent = receipt.payload.selectedText;
    const status = document.createElement('p');
    status.textContent = receipt.state === 'saved' ? 'Saved to account' : `Save pending: ${receipt.error ?? 'waiting'}`;
    article.append(text, status);
    if (receipt.state === 'pending') {
      const button = document.createElement('button');
      button.textContent = 'Try saving again';
      button.onclick = async () => {
        button.disabled = true;
        await chrome.runtime.sendMessage({ type: 'try-saving-again', operationId: receipt.operationId });
        await refresh();
      };
      article.append(button);
    }
    return article;
  }));
  try {
    const response = await fetch('http://127.0.0.1:4317/state');
    if (!response.ok) throw new Error('The prototype server is unavailable.');
    const { cards } = await response.json();
    connection.textContent = local.connectionError ?? 'Connected to local foundation server';
    document.querySelector('#cards').replaceChildren(...cards.map(card => {
      const article = document.createElement('article');
      article.dataset.cardId = card.id;
      const heading = document.createElement('h3');
      heading.textContent = `${card.selected_text} · ${card.status ?? ''}`;
      article.append(heading);
      for (const [index, page] of card.pages.entries()) {
        const status = document.createElement('small');
        status.textContent = `Page ${index + 1} · ${page.status ?? 'No generation attempt'}`;
        const content = document.createElement('pre');
        content.textContent = page.text;
        article.append(status, content);
      }
      return article;
    }));
  } catch (error) { connection.textContent = `${error.message} Pending captures remain on this installation.`; }
}
await refresh();
setInterval(() => refresh().catch(error => { connection.textContent = error.message; }), 1000);
