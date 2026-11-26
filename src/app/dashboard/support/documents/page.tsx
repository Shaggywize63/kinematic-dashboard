'use client';
import AppLearningDocs from '../../../../components/learning/AppLearningDocs';

// Support → Documents. Admin uploads help / support docs that reach the field
// app's Learning Hub (category "Support").
export default function SupportDocumentsPage() {
  return (
    <AppLearningDocs
      category="Support"
      heading="Support Documents"
      blurb="Upload help and support documents. They appear in the app's Learning Hub."
    />
  );
}
