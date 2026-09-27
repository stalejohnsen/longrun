'use client'

import { useActionState } from 'react'
import { LIMITS } from '../../domain/component'
import type { FormField, FormState, FormValues } from '../../lib/component-service'

// Spec 0001 register/edit form. Client component only for per-field errors after a server
// action (Next.js forms guide: useActionState). Errors are announced (aria-live) and each
// field points to its error (aria-describedby).

type Action = (previous: FormState | null, formData: FormData) => Promise<FormState | null>

const EMPTY: FormValues = {
  name: '',
  version: '',
  whereUsed: '',
  owner: '',
  eolProduct: '',
  eolRelease: '',
  manualEndOfSupport: '',
}

type FieldProps = {
  name: FormField
  label: string
  hint?: string
  state: FormState | null
  initial: FormValues
  required?: boolean
  maxLength?: number
  type?: 'text' | 'date'
  multiline?: boolean
}

function Field({
  name,
  label,
  hint,
  state,
  initial,
  required,
  maxLength,
  type = 'text',
  multiline,
}: FieldProps) {
  const error = state?.fieldErrors[name]
  const value = state?.values[name] ?? initial[name]
  const describedBy = [hint ? `${name}-hint` : null, error ? `${name}-error` : null]
    .filter(Boolean)
    .join(' ')
  const common = {
    id: name,
    name,
    // Keyed on the value so the field shows the submitted text after an error.
    defaultValue: value,
    required,
    maxLength,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': describedBy || undefined,
  }
  return (
    <div className="field">
      <label htmlFor={name}>
        {label}
        {required ? '' : ' (optional)'}
      </label>
      {hint ? (
        <p className="hint" id={`${name}-hint`}>
          {hint}
        </p>
      ) : null}
      {multiline ? (
        <textarea key={value} rows={3} {...common} />
      ) : (
        <input key={value} type={type} {...common} />
      )}
      {error ? (
        <p className="error" id={`${name}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function ComponentForm({
  action,
  submitLabel,
  initial = EMPTY,
}: {
  action: Action
  submitLabel: string
  initial?: FormValues
}) {
  const [state, formAction, pending] = useActionState(action, null)
  const hasErrors = state !== null && (state.formError || Object.keys(state.fieldErrors).length > 0)
  const props = { state, initial }
  return (
    <form action={formAction} noValidate>
      <div aria-live="polite">
        {hasErrors ? (
          <p className="error-summary" role="alert">
            {state?.formError ?? 'Check the highlighted fields.'}
          </p>
        ) : null}
      </div>
      <Field name="name" label="Name" required maxLength={LIMITS.name} {...props} />
      <Field name="version" label="Version" required maxLength={LIMITS.version} {...props} />
      <Field
        name="whereUsed"
        label="Where used"
        required
        maxLength={LIMITS.whereUsed}
        multiline
        {...props}
      />
      <Field name="owner" label="Owner" required maxLength={LIMITS.owner} {...props} />
      <fieldset>
        <legend>End of support</legend>
        <p className="hint">
          Give an{' '}
          <a href="https://endoflife.date" target="_blank" rel="noreferrer">
            endoflife.date
          </a>{' '}
          product and release to look up the date, or enter a date yourself.
        </p>
        <Field
          name="eolProduct"
          label="endoflife.date product"
          hint="For example nodejs"
          maxLength={LIMITS.eolProduct}
          {...props}
        />
        <Field
          name="eolRelease"
          label="endoflife.date release"
          hint="For example 24"
          maxLength={LIMITS.eolRelease}
          {...props}
        />
        <Field name="manualEndOfSupport" label="End-of-support date" type="date" {...props} />
      </fieldset>
      <button type="submit" disabled={pending}>
        {pending ? 'Saving…' : submitLabel}
      </button>
    </form>
  )
}
