// Normaliza uma entrada bruta de contexts.json para o shape da linha da tabela
// `contexts`. Fonte tem forma { [key]: { title?, subtitle?, text, reference, images? } }.
// Chamador passa key separado porque no JSON ele e a propria chave do objeto.

export function parseContext(key, raw) {
  return {
    key,
    title: raw.title ?? null,
    subtitle: raw.subtitle ?? null,
    text: raw.text,
    reference: raw.reference,
    images: Array.isArray(raw.images) ? [...raw.images] : [],
  }
}
