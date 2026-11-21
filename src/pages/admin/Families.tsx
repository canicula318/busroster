import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import type { Family, FamilyEmail, Student } from '../../types'

export default function Families({ onChanged }: { onChanged: () => void }) {
  const [families, setFamilies] = useState<Family[] | null>(null)
  const [emails, setEmails] = useState<FamilyEmail[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    const [f, e, s] = await Promise.all([
      supabase.from('families').select('*').order('name'),
      supabase.from('family_emails').select('*').order('email'),
      supabase.from('students').select('*').order('sort').order('name'),
    ])
    if (f.error || e.error || s.error) return setError((f.error ?? e.error ?? s.error)!.message)
    setFamilies(f.data as Family[])
    setEmails(e.data as FamilyEmail[])
    setStudents(s.data as Student[])
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function run(p: PromiseLike<{ error: { message: string } | null }>) {
    const { error } = await p
    if (error) {
      setError(error.message)
      return false
    }
    setError(null)
    await load()
    onChanged()
    return true
  }

  async function addFamily(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    if (await run(supabase.from('families').insert({ name: newName.trim() }))) setNewName('')
  }

  if (!families) return <div className="card muted">{error ?? '読み込み中…'}</div>

  const q = filter.trim().toLowerCase()
  const shown = families.filter(
    (f) =>
      !q ||
      f.name.toLowerCase().includes(q) ||
      emails.some((e) => e.family_id === f.id && e.email.includes(q)) ||
      students.some((s) => s.family_id === f.id && s.name.toLowerCase().includes(q)),
  )

  return (
    <div className="card">
      <h1>家族・生徒 <span className="muted small">Families & students</span></h1>
      <p className="muted small">ログインできるのは、ここに登録されたメールアドレスだけです。1家族に複数のアドレスを登録できます。</p>
      <div className="row wrap">
        <input className="grow" placeholder="検索 / Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <form className="row" onSubmit={addFamily}>
          <input placeholder="新しい家族名 / New family" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn primary">追加</button>
        </form>
      </div>
      {error && <div className="error">{error}</div>}
      {shown.map((f) => (
        <FamilyCard
          key={f.id}
          family={f}
          emails={emails.filter((e) => e.family_id === f.id)}
          students={students.filter((s) => s.family_id === f.id)}
          run={run}
        />
      ))}
    </div>
  )
}

function FamilyCard({
  family, emails, students, run,
}: {
  family: Family
  emails: FamilyEmail[]
  students: Student[]
  run: (p: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>
}) {
  const [name, setName] = useState(family.name)
  const [phone, setPhone] = useState(family.phone ?? '')
  const [newEmail, setNewEmail] = useState('')
  const [newStudent, setNewStudent] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dirty = name !== family.name || phone !== (family.phone ?? '')

  return (
    <div className="family">
      <div className="row wrap">
        <input className="name-input" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="grow" placeholder="電話 / Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {dirty && (
          <button className="btn small primary" onClick={() => run(supabase.from('families').update({ name: name.trim(), phone: phone.trim() || null }).eq('id', family.id))}>保存</button>
        )}
      </div>

      <div className="sub">
        <div className="muted small">ログイン用メール / Sign-in emails</div>
        {emails.map((e) => (
          <span key={e.email} className="chip">
            {e.email}
            <button className="x" title="削除" onClick={() => run(supabase.from('family_emails').delete().eq('email', e.email))}>×</button>
          </span>
        ))}
        <form className="row" onSubmit={async (ev) => {
          ev.preventDefault()
          const v = newEmail.trim().toLowerCase()
          if (v && (await run(supabase.from('family_emails').insert({ email: v, family_id: family.id })))) setNewEmail('')
        }}>
          <input type="email" placeholder="メールを追加 / Add email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <button className="btn small">追加</button>
        </form>
      </div>

      <div className="sub">
        <div className="muted small">生徒 / Students</div>
        {students.map((s) => (
          <StudentRow key={s.id} student={s} run={run} />
        ))}
        <form className="row" onSubmit={async (ev) => {
          ev.preventDefault()
          if (!newStudent.trim()) return
          if (await run(supabase.from('students').insert({ family_id: family.id, name: newStudent.trim(), grade: newGrade.trim() || null }))) {
            setNewStudent('')
            setNewGrade('')
          }
        }}>
          <input placeholder="生徒名 / Name" value={newStudent} onChange={(e) => setNewStudent(e.target.value)} />
          <input placeholder="学年 / Grade" value={newGrade} onChange={(e) => setNewGrade(e.target.value)} />
          <button className="btn small">追加</button>
        </form>
      </div>

      <div className="row end">
        {!confirmDelete ? (
          <button className="link danger-text" onClick={() => setConfirmDelete(true)}>家族を削除</button>
        ) : (
          <>
            <span className="small">申込履歴も含めて削除されます。よろしいですか？</span>
            <button className="btn small danger" onClick={() => run(supabase.from('families').delete().eq('id', family.id))}>削除する</button>
            <button className="btn small" onClick={() => setConfirmDelete(false)}>やめる</button>
          </>
        )}
      </div>
    </div>
  )
}

function StudentRow({ student, run }: { student: Student; run: (p: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean> }) {
  const [name, setName] = useState(student.name)
  const [grade, setGrade] = useState(student.grade ?? '')
  const dirty = name !== student.name || grade !== (student.grade ?? '')
  return (
    <div className={'row student' + (student.active ? '' : ' dim')}>
      <input value={name} onChange={(e) => setName(e.target.value)} />
      <input value={grade} placeholder="学年" onChange={(e) => setGrade(e.target.value)} />
      {dirty && <button className="btn small primary" onClick={() => run(supabase.from('students').update({ name: name.trim(), grade: grade.trim() || null }).eq('id', student.id))}>保存</button>}
      <label className="check small">
        <input type="checkbox" checked={student.active} onChange={(e) => run(supabase.from('students').update({ active: e.target.checked }).eq('id', student.id))} />
        在籍 Active
      </label>
    </div>
  )
}
