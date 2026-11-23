import React, { useEffect, useState } from 'react';
import { Plus, Cpu, CheckCircle2 } from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Button } from '../../../components/common/Button';
import { Badge } from '../../../components/common/Badge';
import { Modal } from '../../../components/common/Modal';
import { Input } from '../../../components/common/Input';
import { Select } from '../../../components/common/Select';
import { ClayLoader } from '../../../components/common/ClayLoader';
import { useToast } from '../../../context/ToastContext';
import { adminService } from '../../../services/adminService';

interface CatalogSkill {
  id: string;
  name: string;
  category: string;
  weight: number;
  enrolledStudents: number;
  verifiedStudents: number;
  passingScore: number;
}

const DEFAULT_CATALOG: Array<{ name: string; category: string; weight: number }> = [
  { name: 'React', category: 'Frameworks & Libraries', weight: 1.2 },
  { name: 'Python', category: 'Programming Languages', weight: 1.3 },
  { name: 'TypeScript', category: 'Programming Languages', weight: 1.2 },
  { name: 'Node.js', category: 'Frameworks & Libraries', weight: 1.2 },
  { name: 'SQL', category: 'Databases & Storage', weight: 1.1 },
  { name: 'PostgreSQL', category: 'Databases & Storage', weight: 1.1 },
  { name: 'MongoDB', category: 'Databases & Storage', weight: 1.2 },
  { name: 'Docker', category: 'Cloud & DevOps', weight: 1.2 },
  { name: 'Kubernetes', category: 'Cloud & DevOps', weight: 1.4 },
  { name: 'AWS', category: 'Cloud & DevOps', weight: 1.3 },
  { name: 'System Design', category: 'System Design', weight: 1.5 },
  { name: 'Java', category: 'Programming Languages', weight: 1.2 },
];

export const SkillManagementPage: React.FC = () => {
  const { success } = useToast();
  const [skills, setSkills] = useState<CatalogSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [skillName, setSkillName] = useState('');
  const [skillCategory, setSkillCategory] = useState('Programming Languages');
  const [skillWeight, setSkillWeight] = useState('1.2');

  useEffect(() => {
    async function load() {
      try {
        const metrics = await adminService.getDashboardMetrics();
        const topMap = new Map<string, { students: number; verified: number }>();
        for (const item of metrics.top_skills || []) {
          topMap.set(item.skill.toLowerCase(), { students: item.students, verified: item.verified });
        }

        const merged: CatalogSkill[] = DEFAULT_CATALOG.map((c, idx) => {
          const live = topMap.get(c.name.toLowerCase());
          return {
            id: `sk-${idx}`,
            name: c.name,
            category: c.category,
            weight: c.weight,
            enrolledStudents: live?.students ?? 0,
            verifiedStudents: live?.verified ?? 0,
            passingScore: 75,
          };
        });

        for (const item of metrics.top_skills || []) {
          if (!merged.some((m) => m.name.toLowerCase() === item.skill.toLowerCase())) {
            merged.push({
              id: `sk-dyn-${item.skill}`,
              name: item.skill,
              category: 'Extracted Competency',
              weight: 1.0,
              enrolledStudents: item.students,
              verifiedStudents: item.verified,
              passingScore: 75,
            });
          }
        }
        setSkills(merged);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;
    setSkills((prev) => [
      ...prev,
      {
        id: `sk-${Date.now()}`,
        name: skillName.trim(),
        category: skillCategory,
        weight: Number(skillWeight) || 1.0,
        enrolledStudents: 0,
        verifiedStudents: 0,
        passingScore: 75,
      },
    ]);
    success(`Skill "${skillName.trim()}" added to taxonomy view.`);
    setSkillName('');
    setAddModalOpen(false);
  };

  if (loading) {
    return <ClayLoader label="Loading Skill Taxonomy Counts..." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
            Master Skill Taxonomy & Live Adoption
          </h1>
          <p className="text-xs text-slate-500 font-medium mt-0.5">
            Track live student skill extraction and verification counts alongside benchmark weights.
          </p>
        </div>

        <Button variant="primary" size="sm" leftIcon={<Plus className="w-4 h-4" />} onClick={() => setAddModalOpen(true)}>
          Add Master Skill
        </Button>
      </div>

      <Card variant="default">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left text-slate-700 font-medium">
            <thead className="bg-orange-50/70 text-slate-600 uppercase font-mono text-[10px] font-bold border-b border-orange-100">
              <tr>
                <th className="px-4 py-3">Skill Name</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3">Weight</th>
                <th className="px-4 py-3">Pass Gate</th>
                <th className="px-4 py-3">Students Extracted</th>
                <th className="px-4 py-3">Students Verified</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {skills.map((s) => (
                <tr key={s.id} className="hover:bg-orange-50/30 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900 flex items-center gap-2">
                    <Cpu className="w-3.5 h-3.5 text-[#E86144]" /> {s.name}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.category}</td>
                  <td className="px-4 py-3 font-mono text-[#E86144] font-bold">{s.weight}x</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-700">{s.passingScore}%</td>
                  <td className="px-4 py-3 font-mono font-bold text-slate-800">{s.enrolledStudents}</td>
                  <td className="px-4 py-3 font-mono font-bold text-emerald-700">
                    <span className="inline-flex items-center gap-1">
                      <CheckCircle2 className="w-3 h-3" /> {s.verifiedStudents}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Modal
        isOpen={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Master Skill"
        subtitle="Add a skill category to the institutional tracking catalog"
      >
        <form onSubmit={handleAdd} className="space-y-4 text-xs font-medium">
          <Input
            label="Skill Name"
            placeholder="e.g. Rust, GraphQL, Apache Kafka"
            value={skillName}
            onChange={(e) => setSkillName(e.target.value)}
            required
          />
          <Select
            label="Taxonomy Category"
            value={skillCategory}
            onChange={(e) => setSkillCategory(e.target.value)}
            options={[
              { value: 'Programming Languages', label: 'Programming Languages' },
              { value: 'Frameworks & Libraries', label: 'Frameworks & Libraries' },
              { value: 'Databases & Storage', label: 'Databases & Storage' },
              { value: 'Cloud & DevOps', label: 'Cloud & DevOps' },
              { value: 'System Design', label: 'System Design' },
            ]}
          />
          <Input
            label="Weight Multiplier"
            type="number"
            step="0.1"
            value={skillWeight}
            onChange={(e) => setSkillWeight(e.target.value)}
          />
          <div className="pt-3 flex justify-end gap-2">
            <Button variant="ghost" size="sm" type="button" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" type="submit">
              Save Skill
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
