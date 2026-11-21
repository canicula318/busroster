const LOGO = import.meta.env.BASE_URL + 'logo.png'

export function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={'brand' + (large ? ' large' : '')}>
      <img src={LOGO} alt="Japanese Weekend School NJ" />
      <div>
        <div className="brand-name">サミットライン</div>
        <div className="brand-sub">補習校バス申込</div>
      </div>
    </div>
  )
}
