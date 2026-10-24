/** 0.2.1：任何 type=object 都必须显式 additionalProperties，否则整份红队预设加载失败。 */
export function sealObjectSchemas(node) {
  if (!node || typeof node !== 'object') return node
  if (Array.isArray(node)) {
    for (const item of node) sealObjectSchemas(item)
    return node
  }
  if (node.type === 'object' && node.additionalProperties === undefined) {
    node.additionalProperties = node.properties ? false : true
  }
  if (node.properties) {
    for (const key of Object.keys(node.properties)) sealObjectSchemas(node.properties[key])
  }
  if (node.items) sealObjectSchemas(node.items)
  if (node.additionalProperties && typeof node.additionalProperties === 'object') {
    sealObjectSchemas(node.additionalProperties)
  }
  return node
}
