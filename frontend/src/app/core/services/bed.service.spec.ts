import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { BedService } from './bed.service';
import { AuthService } from './auth.service';

describe('BedService request lifecycle', () => {
  it('loads once after sign-in and does not reload when loading finishes', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(), provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAuthenticated: signal(true), currentRole: signal('admin') } }
      ]
    });
    const service = TestBed.inject(BedService);
    const http = TestBed.inject(HttpTestingController);
    TestBed.tick();
    http.expectOne(req => req.url.endsWith('/beds')).flush({ success: true, data: [] });
    await Promise.resolve();
    TestBed.tick();
    expect(service.loading()).toBe(false);
    http.expectNone(req => req.url.endsWith('/beds'));
    http.verify();
  });
});
