let processor;
export function setImageProcessor(value) { processor = value; }
export async function optimize(buffer) {
  if (!processor) throw new Error('Image processor is not configured');
  return processor(buffer);
}
