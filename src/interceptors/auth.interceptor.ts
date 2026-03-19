import { Injectable } from '@angular/core';
import { HttpEvent, HttpHandler, HttpInterceptor, HttpRequest } from '@angular/common/http';
import { Observable } from 'rxjs';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {

    console.log('🔥 INTERCEPTOR CALLED');

    const token = localStorage.getItem('auth_token');
    console.log('TOKEN:', token);

    let authReq = req;

    if (token) {
      authReq = req.clone({
        setHeaders: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      });
    }

    console.log('HEADERS:', authReq.headers);

    return next.handle(authReq);
  }
}