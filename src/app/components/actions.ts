'use server'

import { redirect } from 'next/navigation'
import { requireUser } from '../../lib/auth/require-user'
import { registerComponent, type FormState } from '../../lib/component-service'
import { serviceDeps } from '../../lib/services'

// Spec 0001 "Register". Thin wrapper: check the user, save, redirect to the list.
export async function createComponentAction(
  _previous: FormState | null,
  formData: FormData,
): Promise<FormState | null> {
  await requireUser()
  const result = await registerComponent(serviceDeps(), formData)
  if (!result.ok) {
    return 'state' in result ? result.state : null
  }
  redirect(result.notice === 'eol-no-date' ? '/?notice=registered-no-date' : '/?notice=registered')
}
