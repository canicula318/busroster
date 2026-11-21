import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../supabase'
import type { Family, FamilyEmail, Stop, Student } from '../../types'

export default function Families({ onChanged, ownFamilyIds }: { onChanged: () => void; ownFamilyIds: string[] }) {
  const [families, setFamilies] = useState<Family[] | null>(null)
  const [emails, setEmails] = useState<FamilyEmail[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [stops, setStops] = useState<Stop[]>([])
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')
  const [newName, setNewName] = useState('')

  const load = useCallback(async () => {
    const [f, e, s, st] = await Promise.all([
      supabase.from('families').select('*').order('name'),
      supabase.from('family_emails').select('*').order('email'),
      supabase.from('students').select('*').order('sort').order('name'),
      supabase.from('stops').select('*').eq('kind', 'stop').order('sort'),
    ])
    if (f.error || e.error || s.error || st.error) return setError((f.error ?? e.error ?? s.error ?? st.error)!.message)
    setStops(st.data as Stop[])
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

  if (!families) return <div className="muted pad">{error ?? '読み込み中…'}</div>

  const q = filter.trim().toLowerCase()
  const shown = families.filter(
    (f) =>
      !q ||
      f.name.toLowerCase().includes(q) ||
      emails.some((e) => e.family_id === f.id && e.email.includes(q)) ||
      students.some((s) => s.family_id === f.id && (s.name.toLowerCase().includes(q) || (s.name_ja ?? '').includes(q))),
  )

  return (
    <div className="page">
      <h1 className="page-title">家族・生徒 <small>Families</small></h1>
      <p className="muted small">ログインできるのは、ここに登録されたメールアドレスだけです。1家族に複数のアドレスを登録できます。<br />編集できるのは<b>自分の家族だけ</b>です。ほかのご家族の情報は表示のみです（メールアドレスがまだない新しい家族は、どなたでも設定できます）。</p>
      <div className="row wrap">
        <input className="grow" placeholder="検索 / Search" value={filter} onChange={(e) => setFilter(e.target.value)} />
        <form className="row" onSubmit={addFamily}>
          <input placeholder="新しい家族名 / New family" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button className="btn primary">追加</button>
        </form>
      </div>
      {error && <div className="banner error">{error}</div>}
      {[...shown]
        .sort((a, b) => Number(ownFamilyIds.includes(b.id)) - Number(ownFamilyIds.includes(a.id)))
        .map((f) => {
          const famEmails = emails.filter((e) => e.family_id === f.id)
          const famStudents = students.filter((s) => s.family_id === f.id)
          const canEdit = ownFamilyIds.includes(f.id) || famEmails.length === 0
          return canEdit ? (
            <FamilyCard key={f.id} family={f} emails={famEmails} students={famStudents} stops={stops} run={run} mine={ownFamilyIds.includes(f.id)} />
          ) : (
            <FamilyView key={f.id} family={f} emails={famEmails} students={famStudents} stops={stops} />
          )
        })}
    </div>
  )
}

/** Read-only card for a family the signed-in parent doesn't belong to */
function FamilyView({ family, emails, students, stops }: { family: Family; emails: FamilyEmail[]; students: Student[]; stops: Stop[] }) {
  const stop = stops.find((st) => st.id === family.stop_id)
  const active = students.filter((s) => s.active)
  return (
    <div className="family view">
      <div className="fv-head">
        <span className="option-title">{family.name}</span>
        {stop && <span className="pill">{stop.name}</span>}
        <span className="pill gray">表示のみ</span>
      </div>
      {family.phone && <div className="small">📞 {family.phone}</div>}
      <div className="small muted">{emails.map((e) => e.email).join('、')}</div>
      {active.length > 0 && (
        <div className="fv-students">
          {active.map((s) => (
            <span key={s.id}>{s.name_ja || s.name}<span className="muted small"> {s.grade}</span></span>
          ))}
        </div>
      )}
    </div>
  )
}

function FamilyCard({
  family, emails, students, stops, run, mine,
}: {
  mine: boolean
  family: Family
  emails: FamilyEmail[]
  students: Student[]
  stops: Stop[]
  run: (p: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>
}) {
  const [name, setName] = useState(family.name)
  const [phone, setPhone] = useState(family.phone ?? '')
  const [newEmail, setNewEmail] = useState('')
  const [newStudent, setNewStudent] = useState('')
  const [newStudentJa, setNewStudentJa] = useState('')
  const [newGrade, setNewGrade] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const dirty = name !== family.name || phone !== (family.phone ?? '')

  return (
    <div className={"family" + (mine ? " mine" : "")}>
      {mine && <div className="pill" style={{ alignSelf: "flex-start", margin: "0 0 0.4rem" }}>わが家</div>}
      <div className="row wrap">
        <input className="name-input" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="grow" placeholder="電話 / Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
        {dirty && (
          <button className="btn small primary" onClick={() => run(supabase.from('families').update({ name: name.trim(), phone: phone.trim() || null }).eq('id', family.id))}>保存</button>
        )}
      </div>
      <div className="row">
        <span className="muted small">乗車場所</span>
        <select value={family.stop_id ?? ''} onChange={(e) => run(supabase.from('families').update({ stop_id: e.target.value || null }).eq('id', family.id))}>
          <option value="">未設定</option>
          {stops.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
        </select>
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
          if (await run(supabase.from('students').insert({ family_id: family.id, name: newStudent.trim(), name_ja: newStudentJa.trim() || null, grade: newGrade.trim() || null }))) {
            setNewStudent('')
            setNewStudentJa('')
            setNewGrade('')
          }
        }}>
          <input placeholder="氏名（漢字）" value={newStudentJa} onChange={(e) => setNewStudentJa(e.target.value)} />
          <input placeholder="Name (英語)" value={newStudent} onChange={(e) => setNewStudent(e.target.value)} />
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
  const [nameJa, setNameJa] = useState(student.name_ja ?? '')
  const [grade, setGrade] = useState(student.grade ?? '')
  const dirty = name !== student.name || grade !== (student.grade ?? '') || nameJa !== (student.name_ja ?? '')
  return (
    <div className={'row student' + (student.active ? '' : ' dim')}>
      <input value={nameJa} placeholder="氏名（漢字）" onChange={(e) => setNameJa(e.target.value)} />
      <input value={name} placeholder="Name" onChange={(e) => setName(e.target.value)} />
      <input value={grade} placeholder="学年" onChange={(e) => setGrade(e.target.value)} />
      {dirty && <button className="btn small primary" onClick={() => run(supabase.from('students').update({ name: name.trim(), name_ja: nameJa.trim() || null, grade: grade.trim() || null }).eq('id', student.id))}>保存</button>}
      <label className="check small">
        <input type="checkbox" checked={student.active} onChange={(e) => run(supabase.from('students').update({ active: e.target.checked }).eq('id', student.id))} />
        在籍 Active
      </label>
    </div>
  )
}
