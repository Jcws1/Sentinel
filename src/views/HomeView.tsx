import { ViewStub } from './ViewStub'

export function HomeView() {
  return (
    <ViewStub
      summary="Mission overview. The state an operator needs before touching anything else: what is airborne, what is tasked, and whether the autonomy is inside its bounds."
      contents={[
        'Active engagement summary',
        'Interceptor availability roll-up',
        'Policy posture and current constraints',
        'Link health to the edge node',
      ]}
    />
  )
}
