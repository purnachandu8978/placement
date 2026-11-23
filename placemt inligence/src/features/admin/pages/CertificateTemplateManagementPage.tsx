import React, { useEffect, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Clock,
  FileText,
  Plus,
  Send,
  Shield,
  Eye,
  AlertCircle,
  Copy,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { ClayLoader } from '../../../components/common/ClayLoader';
import {
  templateService,
  type CertificateTemplateItem,
  type CreateTemplatePayload,
} from '../../../services/templateService';

const AVAILABLE_PLACEHOLDERS = [
  { tag: '{{student_name}}', desc: 'Full student name' },
  { tag: '{{student_registration_id}}', desc: 'Permanent Student ID (PI-STU-...)' },
  { tag: '{{certificate_serial_number}}', desc: 'Certificate Serial (PI-CV5/CV10-...)' },
  { tag: '{{verification_level}}', desc: 'Level 1 or Level 2' },
  { tag: '{{skills_assessed}}', desc: 'Evaluated competency title' },
  { tag: '{{assessment_score}}', desc: 'Percentage score earned' },
  { tag: '{{assessment_duration}}', desc: '5 or 10 minutes' },
  { tag: '{{issue_date}}', desc: 'Formal date of issuance' },
  { tag: '{{college_name}}', desc: 'Institutional partner name' },
  { tag: '{{signatory_name}}', desc: 'Official authority signatory' },
  { tag: '{{signatory_title}}', desc: 'Authority official title' },
];

export const CertificateTemplateManagementPage: React.FC = () => {
  const [templates, setTemplates] = useState<CertificateTemplateItem[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<CertificateTemplateItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  // New Template Form State
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formHeadline, setFormHeadline] = useState('CERTIFICATE OF COLLEGE VERIFIED COMPETENCY');
  const [formInstitution, setFormInstitution] = useState('Placement Intelligence Digital Credential Authority');
  const [formSignatoryName, setFormSignatoryName] = useState('Dr. Rajesh V. Ramanathan');
  const [formSignatoryTitle, setFormSignatoryTitle] = useState('Dean of Academic Affairs & Placement');
  const [formBorderColor, setFormBorderColor] = useState('#2563EB');
  const [formSubtext, setFormSubtext] = useState(
    'This is to officially certify that {{student_name}} (Student Reg ID: {{student_registration_id}}) has successfully passed the official proctored competency evaluation in {{skills_assessed}} with a score of {{assessment_score}}%.'
  );

  const fetchTemplates = async () => {
    try {
      setLoading(true);
      const [list, active] = await Promise.all([
        templateService.getTemplates(filterStatus),
        templateService.getActivePublishedTemplate(),
      ]);
      setTemplates(list);
      setActiveTemplate(active);
    } catch (err) {
      console.error('Failed to load certificate templates:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTemplates();
  }, [filterStatus]);

  const handleSubmitApproval = async (id: string) => {
    try {
      setActionLoading(id);
      await templateService.submitForApproval(id);
      await fetchTemplates();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to submit template for approval.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      setActionLoading(id);
      await templateService.approveTemplate(id, 'Approved via Admin Certificate Console.');
      await fetchTemplates();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to approve template.');
    } finally {
      setActionLoading(null);
    }
  };

  const handlePublish = async (id: string) => {
    if (!window.confirm('Publishing this template will immediately make it the active standard for all student certificates. Prior templates will be safely archived. Proceed?')) {
      return;
    }
    try {
      setActionLoading(id);
      await templateService.publishTemplate(id);
      await fetchTemplates();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to publish template.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formSubtext.trim()) {
      alert('Template Name and Certificate Subtext Template are required.');
      return;
    }
    try {
      setActionLoading('create');
      const payload: CreateTemplatePayload = {
        name: formName.trim(),
        description: formDesc.trim(),
        custom_headline: formHeadline.trim(),
        institution_name: formInstitution.trim(),
        signatory_name: formSignatoryName.trim(),
        signatory_title: formSignatoryTitle.trim(),
        border_color: formBorderColor,
        subtext_template: formSubtext.trim(),
        orientation: 'LANDSCAPE',
        show_qr_code: true,
        show_serial_number: true,
      };
      await templateService.createTemplate(payload);
      setShowModal(false);
      // Reset form
      setFormName('');
      setFormDesc('');
      await fetchTemplates();
    } catch (err: any) {
      alert(err?.response?.data?.detail || 'Failed to create template.');
    } finally {
      setActionLoading(null);
    }
  };

  const insertPlaceholder = (tag: string) => {
    setFormSubtext((prev) => prev + ' ' + tag);
  };

  const copyTag = (tag: string) => {
    navigator.clipboard.writeText(tag);
    setCopySuccess(tag);
    setTimeout(() => setCopySuccess(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PUBLISHED':
        return <Badge variant="success" className="bg-emerald-100 text-emerald-800 border-emerald-300">PUBLISHED ACTIVE</Badge>;
      case 'APPROVED':
        return <Badge variant="blue" className="bg-blue-100 text-blue-800 border-blue-300">APPROVED</Badge>;
      case 'PENDING_APPROVAL':
        return <Badge variant="warning" className="bg-amber-100 text-amber-800 border-amber-300">PENDING REVIEW</Badge>;
      case 'DRAFT':
        return <Badge variant="neutral" className="bg-slate-100 text-slate-700 border-slate-300">DRAFT</Badge>;
      case 'ARCHIVED':
        return <Badge variant="neutral" className="bg-gray-100 text-gray-500 border-gray-300">ARCHIVED</Badge>;
      default:
        return <Badge variant="neutral">{status}</Badge>;
    }
  };

  const publishedCount = templates.filter((t) => t.status === 'PUBLISHED').length;
  const pendingCount = templates.filter((t) => t.status === 'PENDING_APPROVAL').length;
  const draftCount = templates.filter((t) => t.status === 'DRAFT').length;

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Institutional Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-xl bg-blue-100 text-blue-700">
              <Award className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
                Certificate Template Management
              </h1>
              <p className="text-sm text-slate-500">
                Institutional authority console for authoring, reviewing, and publishing cryptographic digital credential templates.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Certificate Template
          </Button>
        </div>
      </div>

      {/* KPI Stats Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-5 border-l-4 border-l-blue-600 bg-white shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Total Templates</p>
              <h3 className="text-2xl font-bold text-slate-900 mt-1">{templates.length}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Authoring & standard records</p>
            </div>
            <span className="p-2.5 rounded-lg bg-blue-50 text-blue-600">
              <FileText className="w-5 h-5" />
            </span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-emerald-600 bg-white shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Active Published</p>
              <h3 className="text-2xl font-bold text-emerald-700 mt-1">
                {activeTemplate ? `v${activeTemplate.version}` : '1 Active'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Streaming to student portals</p>
            </div>
            <span className="p-2.5 rounded-lg bg-emerald-50 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
            </span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-amber-500 bg-white shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Pending Review</p>
              <h3 className="text-2xl font-bold text-amber-700 mt-1">{pendingCount}</h3>
              <p className="text-xs text-slate-500 mt-0.5">Requires Dean / Admin approval</p>
            </div>
            <span className="p-2.5 rounded-lg bg-amber-50 text-amber-600">
              <Clock className="w-5 h-5" />
            </span>
          </div>
        </Card>

        <Card className="p-5 border-l-4 border-l-slate-400 bg-white shadow-sm">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Draft Designs</p>
              <h3 className="text-2xl font-bold text-slate-800 mt-1">{draftCount}</h3>
              <p className="text-xs text-slate-500 mt-0.5">In-progress customizations</p>
            </div>
            <span className="p-2.5 rounded-lg bg-slate-50 text-slate-600">
              <Shield className="w-5 h-5" />
            </span>
          </div>
        </Card>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-2 overflow-x-auto">
          {['all', 'PUBLISHED', 'APPROVED', 'PENDING_APPROVAL', 'DRAFT'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors capitalize ${
                filterStatus === st
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {st === 'all' ? 'All Templates' : st.replace('_', ' ').toLowerCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Showing {templates.length} template{templates.length === 1 ? '' : 's'}
        </p>
      </div>

      {/* Templates List / Grid */}
      {loading ? (
        <div className="py-16 flex justify-center">
          <ClayLoader label="Loading institutional certificate templates..." />
        </div>
      ) : templates.length === 0 ? (
        <Card className="p-12 text-center bg-slate-50 border-dashed border-2 border-slate-300">
          <FileText className="w-12 h-12 mx-auto text-slate-400 mb-3" />
          <h3 className="text-base font-semibold text-slate-800">No Certificate Templates Found</h3>
          <p className="text-sm text-slate-500 max-w-md mx-auto mt-1 mb-4">
            No templates match the selected filter. Create a new custom certificate design or reset your filters.
          </p>
          <Button variant="primary" onClick={() => setShowModal(true)} className="bg-blue-600 text-white">
            <Plus className="w-4 h-4 mr-1.5" />
            Create First Template
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map((tmpl) => {
            const isPub = tmpl.status === 'PUBLISHED';
            const isApp = tmpl.status === 'APPROVED';
            const isPending = tmpl.status === 'PENDING_APPROVAL';
            const isDraft = tmpl.status === 'DRAFT';

            return (
              <Card
                key={tmpl.id}
                className={`overflow-hidden border bg-white shadow-sm transition-all hover:shadow-md ${
                  isPub ? 'ring-2 ring-emerald-500/20 border-emerald-500' : 'border-slate-200'
                }`}
              >
                {/* Certificate Live Preview Box */}
                <div
                  className="p-5 border-b"
                  style={{
                    backgroundColor: '#FAFCFF',
                    borderLeft: `6px solid ${tmpl.border_color || '#2563EB'}`,
                  }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-bold text-slate-900">{tmpl.name}</h3>
                        <span className="text-xs px-2 py-0.5 rounded font-mono bg-slate-100 text-slate-700">
                          v{tmpl.version}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{tmpl.description}</p>
                    </div>
                    {getStatusBadge(tmpl.status)}
                  </div>

                  {/* Mock Certificate Canvas Snippet */}
                  <div className="mt-4 p-4 rounded-lg bg-white border border-slate-200 shadow-inner text-center space-y-2">
                    <p className="text-[10px] tracking-widest uppercase font-bold text-blue-700">
                      {tmpl.institution_name}
                    </p>
                    <p className="text-xs font-extrabold text-slate-900 tracking-wide uppercase">
                      {tmpl.custom_headline}
                    </p>
                    <p className="text-[11px] text-slate-600 italic px-4 line-clamp-2">
                      {tmpl.subtext_template}
                    </p>
                    <div className="pt-2 flex items-center justify-between border-t border-slate-100 text-[10px] text-slate-500 font-mono">
                      <span>SIGNATORY: {tmpl.signatory_name}</span>
                      <span>QR & SERIAL: ENABLED</span>
                    </div>
                  </div>
                </div>

                {/* Metadata & Actions */}
                <div className="p-4 bg-white flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-slate-500">
                  <div>
                    <p>
                      <span className="font-medium text-slate-700">Title:</span> {tmpl.signatory_title}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Created: {new Date(tmpl.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {isDraft && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSubmitApproval(tmpl.template_id)}
                        disabled={actionLoading === tmpl.template_id}
                        className="text-xs flex items-center gap-1.5 text-blue-700 border-blue-200 hover:bg-blue-50"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Submit for Approval
                      </Button>
                    )}

                    {isPending && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprove(tmpl.template_id)}
                        disabled={actionLoading === tmpl.template_id}
                        className="text-xs flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve Template
                      </Button>
                    )}

                    {isApp && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handlePublish(tmpl.template_id)}
                        disabled={actionLoading === tmpl.template_id}
                        className="text-xs flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                      >
                        <Award className="w-3.5 h-3.5" />
                        Publish to Students
                      </Button>
                    )}

                    {isPub && (
                      <div className="flex items-center gap-1.5 text-emerald-700 font-semibold px-2 py-1 bg-emerald-50 rounded">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        Current System Standard
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create Template Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-8">
            <div className="p-6 bg-blue-600 text-white flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold">Author New Certificate Template</h3>
                <p className="text-xs text-blue-100 mt-0.5">
                  Configure official layout, institution branding, and dynamic placeholders.
                </p>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-blue-100 hover:text-white p-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Template Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Dean's Distinguished Engineering Award"
                    className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Border Accent Color
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={formBorderColor}
                      onChange={(e) => setFormBorderColor(e.target.value)}
                      className="w-10 h-9 p-0.5 rounded cursor-pointer border border-slate-300"
                    />
                    <input
                      type="text"
                      value={formBorderColor}
                      onChange={(e) => setFormBorderColor(e.target.value)}
                      className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 font-mono"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Purpose, target cohort, or criteria description"
                  className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Institution Authority Name
                  </label>
                  <input
                    type="text"
                    value={formInstitution}
                    onChange={(e) => setFormInstitution(e.target.value)}
                    className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Custom Headline
                  </label>
                  <input
                    type="text"
                    value={formHeadline}
                    onChange={(e) => setFormHeadline(e.target.value)}
                    className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Signatory Name
                  </label>
                  <input
                    type="text"
                    value={formSignatoryName}
                    onChange={(e) => setFormSignatoryName(e.target.value)}
                    className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Signatory Official Title
                  </label>
                  <input
                    type="text"
                    value={formSignatoryTitle}
                    onChange={(e) => setFormSignatoryTitle(e.target.value)}
                    className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Dynamic Placeholders Helper */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Approved Dynamic Placeholders (Click to insert)
                </label>
                <div className="flex flex-wrap gap-1.5 p-3 rounded-lg bg-slate-50 border border-slate-200 max-h-32 overflow-y-auto">
                  {AVAILABLE_PLACEHOLDERS.map((p) => (
                    <button
                      key={p.tag}
                      type="button"
                      onClick={() => insertPlaceholder(p.tag)}
                      className="px-2 py-1 text-[11px] rounded bg-white hover:bg-blue-50 text-slate-700 hover:text-blue-700 border border-slate-300 flex items-center gap-1 font-mono transition-colors"
                      title={p.desc}
                    >
                      <span>{p.tag}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Subtext Template */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                  Certificate Presentation Text *
                </label>
                <textarea
                  rows={4}
                  required
                  value={formSubtext}
                  onChange={(e) => setFormSubtext(e.target.value)}
                  className="w-full text-sm px-3.5 py-2 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Placeholders will be safely resolved server-side during cryptographic credential generation.
                </p>
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setShowModal(false)}
                  disabled={actionLoading === 'create'}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  disabled={actionLoading === 'create'}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  {actionLoading === 'create' ? 'Authoring...' : 'Save as Draft'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
