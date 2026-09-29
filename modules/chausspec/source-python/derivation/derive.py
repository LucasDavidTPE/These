"""Dérivation symbolique (SymPy) de la solution générale P-SV d'une couche (notice, annexe A)."""
import sympy as sp
xi,z,lam,mu,s,h=sp.symbols('xi z lambda mu s h',positive=True)
a,b,c,d=sp.symbols('a b c d')
def eqs(U,W,var):
    e1=(lam+mu)*xi*(-xi*U+sp.diff(W,var))+mu*(sp.diff(U,var,2)-xi**2*U)
    e2=(lam+mu)*(-xi*sp.diff(U,var)+sp.diff(W,var,2))+mu*(sp.diff(W,var,2)-xi**2*W)
    return e1,e2
# decaying downward
U=(a+b*xi*z)*sp.exp(-xi*z); W=(c+d*xi*z)*sp.exp(-xi*z)
e1,e2=eqs(U,W,z)
sol=sp.solve([sp.expand(sp.simplify(e1*sp.exp(xi*z))).coeff(z,k) for k in (0,1)]+[sp.expand(sp.simplify(e2*sp.exp(xi*z))).coeff(z,k) for k in (0,1)],[a,b],dict=True)
print('down:',sol)
# growing (decaying upward), in s' = h - z style: use exp(+xi z)
U2=(a+b*xi*z)*sp.exp(xi*z); W2=(c+d*xi*z)*sp.exp(xi*z)
e1,e2=eqs(U2,W2,z)
sol2=sp.solve([sp.expand(sp.simplify(e1*sp.exp(-xi*z))).coeff(z,k) for k in (0,1)]+[sp.expand(sp.simplify(e2*sp.exp(-xi*z))).coeff(z,k) for k in (0,1)],[a,b],dict=True)
print('up:',sol2)
# up family in local var t = xi*(h - s)
C,D,al,be,ga=sp.symbols('C D alpha beta gamma')
t=xi*(h-s)
W3=(C+D*t)*sp.exp(-t); U3=(al*C+be*D+ga*D*t)*sp.exp(-t)
e1,e2=eqs(U3,W3,s)
ex=[sp.expand(sp.simplify(e*sp.exp(t))) for e in (e1,e2)]
eqsl=[]
for e in ex:
    p=sp.Poly(e,s); eqsl+= [sp.simplify(cc) for cc in p.coeffs()]
print(sp.solve(eqsl,[al,be,ga],dict=True))
