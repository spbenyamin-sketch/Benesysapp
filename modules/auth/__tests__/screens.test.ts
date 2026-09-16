import {
  allowedScreens,
  isScreen,
  SCREENS,
  screenOfPath,
  type Screen,
} from '@/modules/auth/screens';

describe('who may open what', () => {
  it('gives an owner every screen, whatever was stored against them', () => {
    expect(allowedScreens({ role: 'owner', screens: [] })).toEqual([...SCREENS]);
    expect(allowedScreens({ role: 'owner', screens: ['items'] })).toEqual([...SCREENS]);
  });

  it('treats a staff member nobody has restricted as unrestricted', () => {
    expect(allowedScreens({ role: 'staff', screens: null })).toEqual([...SCREENS]);
    expect(allowedScreens({ role: 'staff' })).toEqual([...SCREENS]);
  });

  it('gives a restricted staff member exactly what was ticked', () => {
    expect(allowedScreens({ role: 'staff', screens: ['quickbill', 'items'] })).toEqual([
      'quickbill',
      'items',
    ]);
    expect(allowedScreens({ role: 'staff', screens: [] })).toEqual([]);
  });

  it('drops a screen this version of the app no longer has', () => {
    const stored = ['quickbill', 'ledger'] as unknown as Screen[];
    expect(allowedScreens({ role: 'staff', screens: stored })).toEqual(['quickbill']);
  });

  it('knows a screen name from anything else', () => {
    expect(isScreen('reports')).toBe(true);
    expect(isScreen('settings')).toBe(false);
    expect(isScreen(null)).toBe(false);
  });
});

describe('which screen an address belongs to', () => {
  it('places the tabs', () => {
    expect(screenOfPath('/quickbill')).toBe('quickbill');
    expect(screenOfPath('/reports')).toBe('reports');
    expect(screenOfPath('/items')).toBe('items');
  });

  it('places the screens opened from a tab', () => {
    expect(screenOfPath('/invoice/12')).toBe('quickbill');
    expect(screenOfPath('/item/edit/3')).toBe('items');
    expect(screenOfPath('/party/edit/3')).toBe('parties');
    expect(screenOfPath('/report/gst')).toBe('reports');
  });

  it('counts the money screens as reports, not as counter work', () => {
    expect(screenOfPath('/expense/new')).toBe('reports');
    expect(screenOfPath('/account/4')).toBe('reports');
  });

  it('leaves a path no screen owns open to everyone', () => {
    expect(screenOfPath('/settings')).toBeNull();
    expect(screenOfPath('/')).toBeNull();
    // A near miss must not borrow another screen's permission.
    expect(screenOfPath('/itemsold')).toBeNull();
  });
});
