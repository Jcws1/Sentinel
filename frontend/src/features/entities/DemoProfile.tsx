export function DemoProfile() {
  return (
    <details className="detail-section profile-details">
      <summary>STING reference profile</summary>
      <p className="entity-note">
        Demo cruise: <strong>155 km/h · 43.1 m/s</strong>. Constant horizontal
        movement; supplied height is retained.
      </p>
      <dl className="profile-facts">
        <div>
          <dt>Published cruise</dt>
          <dd>140–170 km/h</dd>
        </div>
        <div>
          <dt>Maximum speed</dt>
          <dd>280 km/h</dd>
        </div>
        <div>
          <dt>Operating altitude</dt>
          <dd>0–5,000 m</dd>
        </div>
        <div>
          <dt>Maximum altitude</dt>
          <dd>7,000 m</dd>
        </div>
        <div>
          <dt>Climb rate</dt>
          <dd>30 m/s</dd>
        </div>
        <div>
          <dt>Flight range / return radius</dt>
          <dd>37 / 18.5 km</dd>
        </div>
        <div>
          <dt>Endurance · max speed / cruise</dt>
          <dd>6 / up to 15 min</dd>
        </div>
        <div>
          <dt>Payload / takeoff mass</dt>
          <dd>500 g / 4 ± 0.2 kg</dd>
        </div>
        <div>
          <dt>Control radio / battery</dt>
          <dd>ELRS / 8s3p</dd>
        </div>
        <div>
          <dt>Video options</dt>
          <dd>Analog or digital (HV); daytime or thermal</dd>
        </div>
      </dl>
      <p className="entity-note">
        Manufacturer reference values, not live measurements. Range and
        endurance depend on battery, conditions, payload and operation. The
        source does not specify an altitude datum. These limits, climb, battery
        and video systems are not modeled by this demo.
      </p>
      <a
        className="reference-link"
        href="https://wildhornets.com/en/sting-interceptor"
        target="_blank"
        rel="noreferrer"
      >
        Wild Hornets · published specifications ↗
      </a>
    </details>
  );
}
