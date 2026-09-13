export function coverSlide(activity) {
  return {
    role: 'cover',
    title: activity.title || '함께하는 활동',
    body:
      activity.kind === 'organization'
        ? '우리 단체를 소개합니다'
        : [activity.startDate, activity.startTime, activity.location].filter(Boolean).join(' · '),
    visual: '',
  };
}
export function prepareSlides(activity, suggestion) {
  if (suggestion?.slides)
    return suggestion.slides.map((s, i) => ({ ...s, role: i === 0 ? 'cover' : 'content' }));
  const saved = activity.promotion?.slides;
  if (!saved?.length) return [coverSlide(activity)];
  if (
    saved[0].role === 'cover' ||
    ['scheduled', 'processing', 'published', 'attention'].includes(activity.promotion.status)
  )
    return saved;
  // Preserve every saved content slide; a legacy eight-slide draft needs one content slide removed before saving.
  return [coverSlide(activity), ...saved.map((s) => ({ ...s, role: 'content' }))];
}
