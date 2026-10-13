/** Position für ein Element, das vor `beforeId` (oder ans Ende) einer sortierten Liste eingefügt wird. */
export function positionBetween<T extends { id: string; position: number }>(list: T[], beforeId: string | null): number {
  if (list.length === 0) return 1;
  if (beforeId === null) return list[list.length - 1].position + 1;
  const idx = list.findIndex((x) => x.id === beforeId);
  if (idx === -1) return list[list.length - 1].position + 1;
  if (idx === 0) return list[0].position - 1;
  return (list[idx - 1].position + list[idx].position) / 2;
}

export const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;
