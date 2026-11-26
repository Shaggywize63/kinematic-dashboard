'use client';
import AppLearningDocs from '../../../../components/learning/AppLearningDocs';

// People → Training Materials. Admin uploads training files that reach the
// field app's Learning Hub (category "Training").
export default function TrainingMaterialsPage() {
  return (
    <AppLearningDocs
      category="Training"
      heading="Training Materials"
      blurb="Upload training files for your team. They appear in the app's Learning Hub."
    />
  );
}
