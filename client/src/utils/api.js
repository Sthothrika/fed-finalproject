const API_ROOT = '' // relative — same origin when served together

function handleResponse(res) {
  return res
}

export default {
  get: (url) => fetch(API_ROOT + url, { credentials: 'same-origin' }).then(handleResponse),
  post: (url, body) => fetch(API_ROOT + url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(handleResponse)
}
